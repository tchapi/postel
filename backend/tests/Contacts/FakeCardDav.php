<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use Symfony\Component\HttpClient\Response\MockResponse;

use function in_array;
use function is_array;
use function is_string;
use function sprintf;
use function strlen;

use const ARRAY_FILTER_USE_KEY;
use const PHP_URL_PATH;

/**
 * A small CardDAV server for MockHttpClient: books and cards live in public
 * arrays the test changes, and each request is written down for take().
 */
final class FakeCardDav
{
    /** @var array<string, array{token: string, name: string}> by book href */
    public array $books = [];

    /** @var array<string, array<string, string>> vCard by card href, by book href */
    public array $cards = [];

    /** Anything else than 207 makes every request fail with it */
    public int $status = 207;

    /** @var array<string, int> a status that requests of this method get instead */
    public array $failing = [];

    /** When true, PUT stores the card with a line of its own and answers without an ETag, as servers that change cards do */
    public bool $rewrites = false;

    /** @var array<string, string> the conditional headers of the last PUT or DELETE */
    private array $conditions = [];

    /** @var list<string> */
    private array $requests = [];

    /**
     * The requests received since the last call.
     *
     * @return list<string>
     */
    public function take(): array
    {
        $requests = $this->requests;
        $this->requests = [];

        return $requests;
    }

    /**
     * The If-Match or If-None-Match of the last PUT or DELETE.
     *
     * @return array<string, string>
     */
    public function conditions(): array
    {
        return $this->conditions;
    }

    public static function card(string $name, string $email): string
    {
        return "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:{$name}\r\nEMAIL:{$email}\r\nEND:VCARD\r\n";
    }

    public static function etag(string $vcard): string
    {
        return '"'.md5($vcard).'"';
    }

    /**
     * @param array<string, mixed> $options
     */
    public function __invoke(string $method, string $url, array $options): MockResponse
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $body = is_string($options['body'] ?? null) ? $options['body'] : '';
        $this->requests[] = $method.' '.$path.('REPORT' === $method ? ' '.$this->reportKind($body) : '');
        if (207 !== $this->status || isset($this->failing[$method])) {
            return new MockResponse('', ['http_code' => $this->failing[$method] ?? $this->status]);
        }
        if (in_array($method, ['GET', 'PUT', 'DELETE'], true)) {
            return $this->resource($method, $path, $body, $options);
        }

        return new MockResponse($this->multistatus($method, $path, $body, self::login($options)), ['http_code' => 207]);
    }

    /**
     * One card: read, written or deleted, with If-Match and If-None-Match as RFC 7232 says.
     *
     * @param array<string, mixed> $options
     */
    private function resource(string $method, string $href, string $body, array $options): MockResponse
    {
        $book = substr($href, 0, (int) strrpos($href, '/') + 1);
        $current = $this->cards[$book][$href] ?? null;
        $ifMatch = self::header($options, 'if-match');
        $ifNoneMatch = self::header($options, 'if-none-match');
        if ('GET' !== $method) {
            $this->conditions = array_filter(['If-Match' => $ifMatch, 'If-None-Match' => $ifNoneMatch], static fn (?string $v) => null !== $v);
        }
        if (null !== $ifMatch && (null === $current || $ifMatch !== self::etag($current)) || '*' === $ifNoneMatch && null !== $current) {
            return new MockResponse('', ['http_code' => 412]);
        }
        if ('GET' === $method || 'DELETE' === $method) {
            if (null === $current || !isset($this->books[$book])) {
                return new MockResponse('', ['http_code' => 404]);
            }
            if ('DELETE' === $method) {
                unset($this->cards[$book][$href]);

                return new MockResponse('', ['http_code' => 204]);
            }

            return new MockResponse($current, ['http_code' => 200, 'response_headers' => ['ETag' => self::etag($current)]]);
        }

        if (!isset($this->books[$book])) {
            return new MockResponse('', ['http_code' => 404]);
        }
        if (!str_starts_with($body, 'BEGIN:VCARD') || str_contains($body, 'VERSION:2.1')) {
            return new MockResponse('', ['http_code' => 415]);
        }
        $stored = $this->rewrites ? str_replace("END:VCARD\r\n", "X-SERVER:was here\r\nEND:VCARD\r\n", $body) : $body;
        $this->cards[$book][$href] = $stored;

        return new MockResponse('', ['http_code' => null === $current ? 201 : 204, 'response_headers' => $this->rewrites ? [] : ['ETag' => self::etag($stored)]]);
    }

    /**
     * @param array<string, mixed> $options
     */
    private static function header(array $options, string $name): ?string
    {
        $headers = $options['normalized_headers'] ?? [];
        $line = is_array($headers) && is_array($headers[$name] ?? null) ? ($headers[$name][0] ?? null) : null;

        return is_string($line) ? substr($line, (int) strpos($line, ':') + 2) : null;
    }

    /**
     * Who is asking: "alice" for "alice*app_test", as Davis reads an app key login.
     *
     * @param array<string, mixed> $options
     */
    private static function login(array $options): string
    {
        $headers = $options['normalized_headers'] ?? [];
        $header = is_array($headers) && is_array($headers['authorization'] ?? null) ? (string) ($headers['authorization'][0] ?? '') : '';
        $decoded = (string) base64_decode(substr($header, strlen('Authorization: Basic ')), true);

        return explode('*', explode(':', $decoded)[0])[0];
    }

    private function reportKind(string $body): string
    {
        if (str_contains($body, 'addressbook-multiget')) {
            preg_match_all('#<d:href>([^<]*)</d:href>#', $body, $m);

            return 'multiget '.implode(' ', $m[1]);
        }

        return str_contains($body, 'address-data') ? 'query with cards' : 'query with ETags';
    }

    private function multistatus(string $method, string $path, string $body, string $login): string
    {
        $home = '/dav/addressbooks/'.$login.'/';
        $books = array_filter($this->books, static fn (string $href) => str_starts_with($href, $home), ARRAY_FILTER_USE_KEY);
        $responses = match (true) {
            'REPORT' === $method => str_starts_with($path, $home) ? $this->report($path, $body) : '',
            '/dav/' === $path => '<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/dav/principals/'.$login.'/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            '/dav/principals/'.$login.'/' === $path => '<d:response><d:href>'.$path.'</d:href><d:propstat><d:prop><card:addressbook-home-set><d:href>'.$home.'</d:href></card:addressbook-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            default => '<d:response><d:href>'.$home.'</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                .implode('', array_map(
                    static fn (string $href, array $book) => sprintf(
                        '<d:response><d:href>%s</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>%s<d:displayname>%s</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
                        $href,
                        '' === $book['token'] ? '' : '<d:sync-token>'.$book['token'].'</d:sync-token>',
                        htmlspecialchars($book['name']),
                    ),
                    array_keys($books),
                    $books,
                )),
        };

        return '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'.$responses.'</d:multistatus>';
    }

    private function report(string $book, string $body): string
    {
        $cards = $this->cards[$book] ?? [];
        if (str_contains($body, 'addressbook-multiget')) {
            preg_match_all('#<d:href>([^<]*)</d:href>#', $body, $m);
            $cards = array_intersect_key($cards, array_flip(array_map(htmlspecialchars_decode(...), $m[1])));
        }
        $withData = str_contains($body, 'address-data');

        $out = '';
        foreach ($cards as $href => $vcard) {
            $out .= sprintf(
                '<d:response><d:href>%s</d:href><d:propstat><d:prop><d:getetag>%s</d:getetag>%s</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
                htmlspecialchars($href),
                htmlspecialchars(self::etag($vcard)),
                // Like Davis, carriage returns are sent as &#13; so XML does not turn them into plain line feeds
                $withData ? '<card:address-data>'.str_replace("\r", '&#13;', htmlspecialchars($vcard)).'</card:address-data>' : '',
            );
        }

        return $out;
    }
}
