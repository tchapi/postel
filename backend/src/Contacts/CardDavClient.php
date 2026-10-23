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

use function sprintf;

use const LIBXML_NONET;

/**
 * The few CardDAV requests contacts need: find the address books, read their
 * sync token, fetch every card's name and addresses.
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
     * @return array<string, string> sync token by address book href
     */
    public function books(RemoteUser $user, string $home): array
    {
        $xpath = $this->propfind($user, $home, 1, '<d:resourcetype/><d:sync-token/>');

        $books = [];
        foreach ($this->elements($xpath, '//d:response[.//d:resourcetype/card:addressbook]') as $response) {
            $href = trim($this->text($xpath, 'd:href', $response));
            $books[$href] = trim($this->text($xpath, './/d:sync-token', $response));
        }

        return $books;
    }

    /**
     * Every card of a book, with only FN and EMAIL in it.
     *
     * @return list<string>
     */
    public function cards(RemoteUser $user, string $book): array
    {
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'
            .'<d:prop><card:address-data><card:prop name="FN"/><card:prop name="EMAIL"/></card:address-data></d:prop>'
            .'</card:addressbook-query>';
        $xpath = $this->request($user, 'REPORT', $book, 1, $body);

        $cards = [];
        foreach ($this->elements($xpath, '//card:address-data') as $data) {
            $cards[] = $data->textContent;
        }

        return $cards;
    }

    private function propfind(RemoteUser $user, string $url, int $depth, string $props): DOMXPath
    {
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop>'.$props.'</d:prop></d:propfind>';

        return $this->request($user, 'PROPFIND', $url, $depth, $body);
    }

    private function request(RemoteUser $user, string $method, string $url, int $depth, string $body): DOMXPath
    {
        try {
            $response = $this->http->request($method, $this->absolute($url), [
                'auth_basic' => [$this->config->login($user), $this->config->secret],
                'headers' => ['Depth' => (string) $depth, 'Content-Type' => 'application/xml; charset=utf-8'],
                'body' => $body,
                'timeout' => 10,
            ]);
            if (207 !== $response->getStatusCode()) {
                throw new DavisUnavailable(sprintf('%s %s: HTTP %d', $method, $url, $response->getStatusCode()));
            }
            $xml = $response->getContent();
        } catch (ExceptionInterface $e) {
            throw new DavisUnavailable(sprintf('%s %s: %s', $method, $url, $e->getMessage()), previous: $e);
        }

        $document = new DOMDocument();
        if (!$document->loadXML($xml, LIBXML_NONET)) {
            throw new DavisUnavailable(sprintf('%s %s: not XML', $method, $url));
        }
        $xpath = new DOMXPath($document);
        foreach (self::NAMESPACES as $prefix => $namespace) {
            $xpath->registerNamespace($prefix, $namespace);
        }

        return $xpath;
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
