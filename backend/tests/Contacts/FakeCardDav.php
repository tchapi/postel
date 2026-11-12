<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use Symfony\Component\HttpClient\Response\MockResponse;

use function is_string;
use function sprintf;

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

    public function __construct(private readonly string $home)
    {
    }

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

        return new MockResponse($this->multistatus($method, $path, $body), ['http_code' => 207]);
    }

    private function reportKind(string $body): string
    {
        if (str_contains($body, 'addressbook-multiget')) {
            preg_match_all('#<d:href>([^<]*)</d:href>#', $body, $m);

            return 'multiget '.implode(' ', $m[1]);
        }

        return str_contains($body, 'address-data') ? 'query with cards' : 'query with ETags';
    }

    private function multistatus(string $method, string $path, string $body): string
    {
        $responses = match (true) {
            'REPORT' === $method => $this->report($path, $body),
            '/dav/' === $path => '<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/dav/principals/alice/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            '/dav/principals/alice/' === $path => '<d:response><d:href>'.$path.'</d:href><d:propstat><d:prop><card:addressbook-home-set><d:href>'.$this->home.'</d:href></card:addressbook-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            default => '<d:response><d:href>'.$this->home.'</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                .implode('', array_map(
                    static fn (string $href, array $book) => sprintf(
                        '<d:response><d:href>%s</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>%s<d:displayname>%s</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
                        $href,
                        '' === $book['token'] ? '' : '<d:sync-token>'.$book['token'].'</d:sync-token>',
                        htmlspecialchars($book['name']),
                    ),
                    array_keys($this->books),
                    $this->books,
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
                $withData ? '<card:address-data>'.htmlspecialchars($vcard).'</card:address-data>' : '',
            );
        }

        return $out;
    }
}
