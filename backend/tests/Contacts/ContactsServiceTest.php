<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Contacts\CardDavClient;
use App\Contacts\ContactsService;
use App\Contacts\DavisConfig;
use App\Entity\Contact;
use App\Repository\ContactRepository;
use App\Repository\ContactSyncRepository;
use App\Security\RemoteUser;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

use function sprintf;

use const PHP_URL_PATH;

/**
 * Against a fake Davis: the requests it gets tell what the cache asked for.
 */
final class ContactsServiceTest extends KernelTestCase
{
    private const string URL = 'https://dav.example.test/dav/';
    private const string HOME = '/dav/addressbooks/alice/';

    private RemoteUser $user;
    private EntityManagerInterface $entityManager;

    /** @var array<string, string> sync token by address book href */
    private array $books = [];

    /** @var array<string, list<string>> cards by address book href */
    private array $cards = [];

    private int $status = 207;

    /** @var list<string> */
    private array $requests = [];

    protected function setUp(): void
    {
        self::bootKernel();
        $this->user = new RemoteUser('alice', 'alice@example.test');
        $this->entityManager = self::getContainer()->get(EntityManagerInterface::class);
        $this->entityManager->createQuery('DELETE FROM App\Entity\Contact')->execute();
        $this->entityManager->createQuery('DELETE FROM App\Entity\ContactSync')->execute();

        $this->books = [self::HOME.'contacts/' => 'token-1'];
        $this->cards = [self::HOME.'contacts/' => [self::card('Émile Durand', 'emile@example.test'), self::card('Bob Martin', 'bob@example.test')]];
    }

    public function testTheFirstSearchFillsTheCache(): void
    {
        $found = $this->service()->search($this->user, 'emile');

        self::assertSame(['emile@example.test'], array_map(static fn (Contact $c) => $c->getEmail(), $found));
        self::assertSame(['PROPFIND /dav/', 'PROPFIND /dav/principals/alice/', 'PROPFIND '.self::HOME, 'REPORT '.self::HOME.'contacts/'], $this->requests);
    }

    public function testAnUnchangedBookIsNotFetchedAgain(): void
    {
        $service = $this->service();
        $service->refresh($this->user);
        $this->requests = [];

        $service->refresh($this->user);

        self::assertSame(['PROPFIND '.self::HOME], $this->requests, 'the home is remembered, the cards are not fetched');
    }

    public function testAChangedBookIsReplacedAndAGoneOneDropped(): void
    {
        $this->books[self::HOME.'work/'] = 'w-1';
        $this->cards[self::HOME.'work/'] = [self::card('Carol Petit', 'carol@work.example')];
        $service = $this->service();
        $service->refresh($this->user);

        $this->books = [self::HOME.'contacts/' => 'token-2'];
        $this->cards[self::HOME.'contacts/'] = [self::card('Bob Martin', 'bob@new.example')];
        $service->refresh($this->user);

        self::assertSame(['bob@new.example'], $this->cached());
    }

    public function testDavisAwayKeepsWhatWeHave(): void
    {
        $service = $this->service();
        $service->refresh($this->user);

        $this->status = 401;
        $service->refresh($this->user);

        self::assertSame(['bob@example.test', 'emile@example.test'], $this->cached());
    }

    public function testNothingIsAskedWhenDavisIsNotConfigured(): void
    {
        $service = $this->service(new DavisConfig('', '', ''));

        self::assertSame([], $service->search($this->user, 'bob'));
        self::assertSame([], $this->requests);
    }

    public function testAWordStartingWithTheQueryComesFirst(): void
    {
        $this->cards[self::HOME.'contacts/'][] = self::card('Rob Ober', 'rob@example.test');

        $found = $this->service()->search($this->user, 'ob');

        // Both contain "ob", only Ober starts with it
        self::assertSame(['rob@example.test', 'bob@example.test'], array_map(static fn (Contact $c) => $c->getEmail(), $found));
    }

    /**
     * @return list<string>
     */
    private function cached(): array
    {
        $all = self::getContainer()->get(ContactRepository::class)->findBy(['owner' => 'alice'], ['email' => 'ASC']);

        return array_map(static fn (Contact $c) => $c->getEmail(), $all);
    }

    private function service(?DavisConfig $config = null): ContactsService
    {
        $config ??= new DavisConfig(self::URL, 'app_test', 'secret');
        $http = new MockHttpClient(function (string $method, string $url, array $options): MockResponse {
            $path = (string) parse_url($url, PHP_URL_PATH);
            $this->requests[] = $method.' '.$path;
            if (207 !== $this->status) {
                return new MockResponse('', ['http_code' => $this->status]);
            }

            return new MockResponse($this->answer($method, $path), ['http_code' => 207]);
        });

        return new ContactsService(
            $config,
            new CardDavClient($http, $config),
            self::getContainer()->get(ContactRepository::class),
            self::getContainer()->get(ContactSyncRepository::class),
            $this->entityManager,
            new NullLogger(),
        );
    }

    private function answer(string $method, string $path): string
    {
        $prop = match (true) {
            'REPORT' === $method => implode('', array_map(
                static fn (string $card) => sprintf('<d:response><d:href>%s1.vcf</d:href><d:propstat><d:prop><card:address-data>%s</card:address-data></d:prop></d:propstat></d:response>', $path, htmlspecialchars($card)),
                $this->cards[$path] ?? [],
            )),
            '/dav/' === $path => '<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/dav/principals/alice/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>',
            '/dav/principals/alice/' === $path => '<d:response><d:href>'.$path.'</d:href><d:propstat><d:prop><card:addressbook-home-set><d:href>'.self::HOME.'</d:href></card:addressbook-home-set></d:prop></d:propstat></d:response>',
            default => '<d:response><d:href>'.self::HOME.'</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
                .implode('', array_map(
                    static fn (string $href, string $token) => sprintf('<d:response><d:href>%s</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><card:addressbook/></d:resourcetype><d:sync-token>%s</d:sync-token></d:prop></d:propstat></d:response>', $href, $token),
                    array_keys($this->books),
                    $this->books,
                )),
        };

        return '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'.$prop.'</d:multistatus>';
    }

    private static function card(string $name, string $email): string
    {
        return "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:{$name}\r\nEMAIL:{$email}\r\nEND:VCARD\r\n";
    }
}
