<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Security\RemoteUser;
use DOMDocument;
use DOMElement;
use DOMXPath;
use RuntimeException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

use function in_array;
use function sprintf;

use const ENT_XML1;
use const LIBXML_NONET;

/**
 * The CardDAV requests the address book needs (RFC 6352, RFC 4918), nothing
 * specific to Davis: find the address books, read their sync token and the
 * ETags of their cards, fetch cards whole.
 */
final class CardDavClient
{
    private const array NAMESPACES = ['d' => 'DAV:', 'card' => 'urn:ietf:params:xml:ns:carddav'];

    public function __construct(
        private readonly HttpClientInterface $http,
        private readonly DavisConfig $config,
    ) {
    }

    /**
     * The user's address book home, from their principal (RFC 6352 section 7.1.1).
     */
    public function home(RemoteUser $user): string
    {
        $principal = $this->href($this->propfind($user, $this->config->url, 0, '<d:current-user-principal/>'), '//d:current-user-principal/d:href');

        return $this->href($this->propfind($user, $principal, 0, '<card:addressbook-home-set/>'), '//card:addressbook-home-set/d:href');
    }

    /**
     * @return array<string, array{token: string, name: string}> sync token and display name by address book href
     */
    public function books(RemoteUser $user, string $home): array
    {
        $xpath = $this->propfind($user, $home, 1, '<d:resourcetype/><d:sync-token/><d:displayname/>');

        $books = [];
        foreach ($this->elements($xpath, '//d:response[.//d:resourcetype/card:addressbook]') as $response) {
            $href = trim($this->text($xpath, 'd:href', $response));
            $books[$href] = [
                'token' => trim($this->text($xpath, './/d:sync-token', $response)),
                'name' => trim($this->text($xpath, './/d:displayname', $response)),
            ];
        }

        return $books;
    }

    /**
     * The ETag of every card in a book, nothing else (RFC 6352 section 8.6).
     *
     * @return array<string, string> ETag by card href
     */
    public function etags(RemoteUser $user, string $book): array
    {
        $etags = [];
        foreach ($this->report($user, $book, 'addressbook-query', '<d:prop><d:getetag/></d:prop>') as $href => $props) {
            $etags[$href] = $props['etag'];
        }

        return $etags;
    }

    /**
     * Every card of a book, whole.
     *
     * @return array<string, array{etag: string, vcard: string}> by card href
     */
    public function all(RemoteUser $user, string $book): array
    {
        return $this->withData($this->report($user, $book, 'addressbook-query', '<d:prop><d:getetag/><card:address-data/></d:prop>'));
    }

    /**
     * These cards of a book, whole (RFC 6352 section 8.7). A card that is gone
     * in the meantime is simply not in the answer.
     *
     * @param list<string> $hrefs
     *
     * @return array<string, array{etag: string, vcard: string}> by card href
     */
    public function multiget(RemoteUser $user, string $book, array $hrefs): array
    {
        $refs = implode('', array_map(static fn (string $href) => '<d:href>'.htmlspecialchars($href, ENT_XML1).'</d:href>', $hrefs));

        return $this->withData($this->report($user, $book, 'addressbook-multiget', '<d:prop><d:getetag/><card:address-data/></d:prop>'.$refs));
    }

    /**
     * One card, whole.
     *
     * @return array{etag: string, vcard: string}
     */
    public function get(RemoteUser $user, string $href): array
    {
        $response = $this->send($user, 'GET', $href, ['headers' => ['Accept' => 'text/vcard']], [200]);
        try {
            $vcard = $response->getContent();
            $etag = $response->getHeaders()['etag'][0] ?? '';
        } catch (ExceptionInterface $e) {
            throw new DavisUnavailable(sprintf('GET %s: %s', $href, $e->getMessage()), previous: $e);
        }
        if ('' === $etag || '' === trim($vcard)) {
            throw new DavisUnavailable(sprintf('GET %s: no card or no ETag', $href));
        }

        return ['etag' => $etag, 'vcard' => $vcard];
    }

    /**
     * Writes a card. With an ETag, only over that version of the card; without
     * one, only if there is no card there yet.
     *
     * @return ?string the new ETag, or null when the server does not say (it
     *                 may have changed the card, which must then be read again)
     *
     * @throws CardChanged when the card is not at that version any more
     */
    public function put(RemoteUser $user, string $href, string $vcard, ?string $ifMatch): ?string
    {
        $condition = null === $ifMatch ? ['If-None-Match' => '*'] : ['If-Match' => $ifMatch];
        $response = $this->send($user, 'PUT', $href, [
            'headers' => ['Content-Type' => 'text/vcard; charset=utf-8'] + $condition,
            'body' => $vcard,
        ], [200, 201, 204]);
        try {
            $etag = $response->getHeaders(false)['etag'][0] ?? null;
        } catch (ExceptionInterface $e) {
            throw new DavisUnavailable(sprintf('PUT %s: %s', $href, $e->getMessage()), previous: $e);
        }

        // A weak ETag says the server stored something else than what was sent
        return null === $etag || str_starts_with($etag, 'W/') ? null : $etag;
    }

    /**
     * @throws CardChanged when the card is not at that version any more
     */
    public function delete(RemoteUser $user, string $href, string $ifMatch): void
    {
        $this->send($user, 'DELETE', $href, ['headers' => ['If-Match' => $ifMatch]], [200, 204]);
    }

    /**
     * @return array<string, array{etag: string, vcard: ?string}> by card href, only what the server found
     */
    private function report(RemoteUser $user, string $book, string $report, string $content): array
    {
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<card:'.$report.' xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'.$content.'</card:'.$report.'>';
        $xpath = $this->request($user, 'REPORT', $book, 1, $body);

        $cards = [];
        foreach ($this->elements($xpath, '//d:response') as $response) {
            $href = trim($this->text($xpath, 'd:href', $response));
            // Only the properties the server could give, not those under a 404 propstat
            $found = './/d:propstat[not(d:status) or contains(d:status, " 200 ")]/d:prop/';
            $etag = trim($this->text($xpath, $found.'d:getetag', $response));
            if ('' === $href || '' === $etag) {
                continue;
            }
            $data = $this->elements($xpath, $found.'card:address-data', $response)[0] ?? null;
            $cards[$href] = ['etag' => $etag, 'vcard' => $data?->textContent];
        }

        return $cards;
    }

    /**
     * @param array<string, array{etag: string, vcard: ?string}> $cards
     *
     * @return array<string, array{etag: string, vcard: string}>
     */
    private function withData(array $cards): array
    {
        $whole = [];
        foreach ($cards as $href => $card) {
            if (null !== $card['vcard'] && '' !== trim($card['vcard'])) {
                $whole[$href] = ['etag' => $card['etag'], 'vcard' => $card['vcard']];
            }
        }

        return $whole;
    }

    private function propfind(RemoteUser $user, string $url, int $depth, string $props): DOMXPath
    {
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop>'.$props.'</d:prop></d:propfind>';

        return $this->request($user, 'PROPFIND', $url, $depth, $body);
    }

    private function request(RemoteUser $user, string $method, string $url, int $depth, string $body): DOMXPath
    {
        $response = $this->send($user, $method, $url, [
            'headers' => ['Depth' => (string) $depth, 'Content-Type' => 'application/xml; charset=utf-8'],
            'body' => $body,
        ], [207]);
        try {
            $xml = $response->getContent();
        } catch (ExceptionInterface $e) {
            throw new DavisUnavailable(sprintf('%s %s: %s', $method, $url, $e->getMessage()), previous: $e);
        }

        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            $loaded = '' !== $xml && $document->loadXML($xml, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        if (!$loaded) {
            throw new DavisUnavailable(sprintf('%s %s: not XML', $method, $url));
        }
        $xpath = new DOMXPath($document);
        foreach (self::NAMESPACES as $prefix => $namespace) {
            $xpath->registerNamespace($prefix, $namespace);
        }

        return $xpath;
    }

    /**
     * @param array<string, mixed> $options
     * @param list<int>            $accepted the statuses that mean it worked
     */
    private function send(RemoteUser $user, string $method, string $url, array $options, array $accepted): ResponseInterface
    {
        try {
            $response = $this->http->request($method, $this->absolute($url), $options + [
                'auth_basic' => [$this->config->login($user), $this->config->secret],
                'timeout' => 10,
            ]);
            $status = $response->getStatusCode();
        } catch (ExceptionInterface $e) {
            throw new DavisUnavailable(sprintf('%s %s: %s', $method, $url, $e->getMessage()), previous: $e);
        }

        $message = sprintf('%s %s: HTTP %d', $method, $url, $status);
        // Reading a book or the home that fails means the server is not answering as it should
        $onCard = in_array($method, ['GET', 'PUT', 'DELETE'], true);

        return match (true) {
            in_array($status, $accepted, true) => $response,
            $onCard && 412 === $status => throw new CardChanged($message),
            $onCard && (404 === $status || 410 === $status) => throw new CardGone($message),
            // Refused for what was sent, not because the server or the key is broken
            in_array($status, [400, 403, 409, 413, 415, 422], true) && 'PUT' === $method => throw new CardRefused($message),
            default => throw new DavisUnavailable($message),
        };
    }

    private function href(DOMXPath $xpath, string $query): string
    {
        $href = trim($this->text($xpath, $query));
        if ('' === $href) {
            throw new DavisUnavailable('no '.$query.' in the answer');
        }

        return $href;
    }

    /**
     * @return list<DOMElement>
     */
    private function elements(DOMXPath $xpath, string $query, ?DOMElement $context = null): array
    {
        $nodes = $xpath->query($query, $context);

        return false === $nodes ? [] : array_values(array_filter(iterator_to_array($nodes), static fn ($n) => $n instanceof DOMElement));
    }

    private function text(DOMXPath $xpath, string $query, ?DOMElement $context = null): string
    {
        return $this->elements($xpath, $query, $context)[0]->textContent ?? '';
    }

    /**
     * Hrefs in DAV answers are usually absolute paths on the server.
     */
    private function absolute(string $url): string
    {
        if (preg_match('#^https?://#i', $url)) {
            return $url;
        }
        $parts = parse_url($this->config->url);
        if (!isset($parts['scheme'], $parts['host'])) {
            throw new RuntimeException('DAVIS_URL must be an absolute URL');
        }

        return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '').$url;
    }
}
