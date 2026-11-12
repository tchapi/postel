<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use Symfony\Component\HttpClient\Response\MockResponse;

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
        if (207 !== $this->status) {
            return new MockResponse('', ['http_code' => $this->status]);
        }

        return new MockResponse($this->multistatus($method, $path, $body, self::login($options)), ['http_code' => 207]);
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
