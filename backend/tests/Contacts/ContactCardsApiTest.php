<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Entity\Card;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

use const JSON_THROW_ON_ERROR;

/**
 * The address book API, against the fake server of tests/Contacts/FakeCardDav.php.
 */
final class ContactCardsApiTest extends WebTestCase
{
    private const string BOOK = '/dav/addressbooks/alice/contacts/';
    private const string WORK = '/dav/addressbooks/alice/work/';

    private KernelBrowser $client;
    private FakeCardDav $dav;

    protected function setUp(): void
    {
        $this->client = self::createClient();
        // One container for the whole test, so the fake server keeps its cards between requests
        $this->client->disableReboot();
        $entityManager = self::getContainer()->get(EntityManagerInterface::class);
        foreach (['Contact', 'Card', 'ContactSync'] as $entity) {
            $entityManager->createQuery('DELETE FROM App\Entity\\'.$entity)->execute();
        }

        /** @psalm-suppress ServiceNotFound it is only a service in the test environment */
        $dav = self::getContainer()->get(FakeCardDav::class);
        self::assertInstanceOf(FakeCardDav::class, $dav);
        $this->dav = $dav;
        $this->dav->books = [self::BOOK => ['token' => 't1', 'name' => 'Contacts'], self::WORK => ['token' => 'w1', 'name' => 'Work']];
        $this->dav->cards = [
            self::BOOK => [
                self::BOOK.'emile.vcf' => (string) file_get_contents(__DIR__.'/../Fixtures/vcard/plain-3.0.vcf'),
                self::BOOK.'pic.vcf' => (string) file_get_contents(__DIR__.'/../Fixtures/vcard/photo-3.0.vcf'),
            ],
            self::WORK => [self::WORK.'carol.vcf' => FakeCardDav::card('Carol Petit', 'carol@work.example')],
        ];
    }

    public function testMeSaysTheAddressBookIsThere(): void
    {
        self::assertTrue($this->get('/api/me')['contacts']);
    }

    public function testTheListHasTheBooksAndEveryCardInShort(): void
    {
        $list = $this->get('/api/contacts/cards');

        self::assertTrue($list['available']);
        self::assertSame([['id' => self::id(self::BOOK), 'name' => 'Contacts'], ['id' => self::id(self::WORK), 'name' => 'Work']], $list['books']);
        self::assertSame([
            [
                'id' => self::id(self::WORK.'carol.vcf'),
                'book' => self::id(self::WORK),
                'etag' => FakeCardDav::etag($this->dav->cards[self::WORK][self::WORK.'carol.vcf']),
                'name' => 'Carol Petit',
                'org' => null,
                'emails' => ['carol@work.example'],
                'phones' => [],
                'photo' => false,
            ],
            [
                'id' => self::id(self::BOOK.'emile.vcf'),
                'book' => self::id(self::BOOK),
                'etag' => FakeCardDav::etag($this->dav->cards[self::BOOK][self::BOOK.'emile.vcf']),
                'name' => 'Émile Durand',
                'org' => 'Example',
                'emails' => ['emile@example.test', 'emile@home.example'],
                'phones' => ['+33 6 00 00 00 01', '+33 1 00 00 00 01'],
                'photo' => false,
            ],
        ], array_values(array_filter($list['cards'], static fn (array $c) => !$c['photo'])));
        self::assertCount(3, $list['cards']);
    }

    public function testACardInFull(): void
    {
        $this->get('/api/contacts/cards');

        $card = $this->get('/api/contacts/cards/'.self::id(self::BOOK.'emile.vcf'));

        self::assertSame(self::id(self::BOOK.'emile.vcf'), $card['id']);
        self::assertSame(self::id(self::BOOK), $card['book']);
        self::assertSame('Émile', $card['firstName']);
        self::assertSame('Engineer', $card['title']);
        self::assertSame(['key' => 0, 'value' => 'emile@example.test', 'type' => 'work', 'label' => null], $card['emails'][0]);
        self::assertSame('1984-03-12', $card['birthday']);
        self::assertFalse($card['photo']);
    }

    public function testAnotherUsersCardIsNotFound(): void
    {
        $this->get('/api/contacts/cards');
        $id = self::id(self::BOOK.'emile.vcf');

        $this->client->request('GET', '/api/contacts/cards/'.$id, server: self::server('bob'));
        self::assertResponseStatusCodeSame(404);
        self::assertSame('contact_not_found', $this->json()['error']);

        // Not even under bob's own key for the same href
        self::assertSame([], $this->get('/api/contacts/cards', 'bob')['cards']);
        $this->client->request('GET', '/api/contacts/cards/'.$id.'/vcf', server: self::server('bob'));
        self::assertResponseStatusCodeSame(404);
    }

    public function testThePictureIsServedForAYear(): void
    {
        $this->get('/api/contacts/cards');

        $this->client->request('GET', '/api/contacts/cards/'.self::id(self::BOOK.'pic.vcf').'/photo', server: self::server());

        self::assertResponseIsSuccessful();
        $response = $this->client->getResponse();
        self::assertSame('image/png', $response->headers->get('Content-Type'));
        self::assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        self::assertStringContainsString('immutable', (string) $response->headers->get('Cache-Control'));
        self::assertStringStartsWith("\x89PNG", (string) $response->getContent());

        $this->client->request('GET', '/api/contacts/cards/'.self::id(self::BOOK.'emile.vcf').'/photo', server: self::server());
        self::assertResponseStatusCodeSame(404);
    }

    public function testDownloadsAreAttachmentsNamedAfterWhatTheyHold(): void
    {
        $this->get('/api/contacts/cards');

        $this->client->request('GET', '/api/contacts/cards/'.self::id(self::BOOK.'emile.vcf').'/vcf', server: self::server());
        $response = $this->client->getResponse();
        self::assertSame('text/vcard; charset=utf-8', $response->headers->get('Content-Type'));
        self::assertSame('attachment; filename="Emile Durand.vcf"; filename*=utf-8\'\'%C3%89mile%20Durand.vcf', $response->headers->get('Content-Disposition'));
        self::assertStringContainsString('item1.X-ABLabel:_$!<Other>!$_'."\r\n", $this->downloadOf('apple-grouped.vcf'));

        $this->client->request('GET', '/api/contacts/books/'.self::id(self::WORK).'/vcf', server: self::server());
        self::assertStringContainsString('filename=Work.vcf', (string) $this->client->getResponse()->headers->get('Content-Disposition'));
        self::assertSame(1, substr_count((string) $this->client->getResponse()->getContent(), 'BEGIN:VCARD'));

        $this->client->request('GET', '/api/contacts/vcf', server: self::server());
        self::assertSame(4, substr_count((string) $this->client->getResponse()->getContent(), 'BEGIN:VCARD'), 'the Apple card came with the refresh');
    }

    public function testARefreshSaysWhetherAnythingChanged(): void
    {
        $this->get('/api/contacts/cards');

        $this->client->request('POST', '/api/contacts/refresh', server: self::server());
        self::assertSame(['available' => true, 'changed' => false], $this->json());

        $this->dav->books[self::WORK] = ['token' => 'w2', 'name' => 'Work'];
        $this->dav->cards[self::WORK][self::WORK.'trent.vcf'] = FakeCardDav::card('Trent Simon', 'trent@work.example');
        $this->client->request('POST', '/api/contacts/refresh', server: self::server());
        self::assertSame(['available' => true, 'changed' => true], $this->json());

        $this->dav->status = 503;
        $this->client->request('POST', '/api/contacts/refresh', server: self::server());
        self::assertSame(['available' => false, 'changed' => false], $this->json());
        self::assertFalse($this->get('/api/contacts/cards')['available']);
        self::assertCount(4, $this->get('/api/contacts/cards')['cards'], 'the cache is still there');
    }

    public function testNothingIsThereWhenTheAddressBookIsNotSetUp(): void
    {
        $saved = [$_ENV['DAVIS_URL'] ?? null, $_SERVER['DAVIS_URL'] ?? null];
        $_ENV['DAVIS_URL'] = $_SERVER['DAVIS_URL'] = '';
        try {
            self::ensureKernelShutdown();
            $client = self::createClient();
            $client->request('GET', '/api/me', server: self::server());
            self::assertFalse(json_decode((string) $client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR)['contacts']);

            foreach (['/api/contacts/cards', '/api/contacts/cards/'.self::id(self::BOOK.'emile.vcf'), '/api/contacts/vcf'] as $url) {
                $client->request('GET', $url, server: self::server());
                self::assertResponseStatusCodeSame(404);
                self::assertStringStartsWith('{"error":"contacts_disabled"', (string) $client->getResponse()->getContent());
            }
        } finally {
            [$_ENV['DAVIS_URL'], $_SERVER['DAVIS_URL']] = $saved;
        }
    }

    private function downloadOf(string $fixture): string
    {
        $this->dav->books[self::BOOK] = ['token' => 't2', 'name' => 'Contacts'];
        $this->dav->cards[self::BOOK][self::BOOK.$fixture] = (string) file_get_contents(__DIR__.'/../Fixtures/vcard/'.$fixture);
        $this->client->request('POST', '/api/contacts/refresh', server: self::server());
        $this->client->request('GET', '/api/contacts/cards/'.self::id(self::BOOK.$fixture).'/vcf', server: self::server());

        return (string) $this->client->getResponse()->getContent();
    }

    private static function id(string $href, string $owner = 'alice'): string
    {
        return Card::idFor($owner, $href);
    }

    /**
     * @return array<string, mixed>
     */
    private function get(string $url, string $user = 'alice'): array
    {
        $this->client->request('GET', $url, server: self::server($user));
        self::assertResponseIsSuccessful();

        return $this->json();
    }

    /**
     * @return array<string, mixed>
     */
    private function json(): array
    {
        $data = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }

    /**
     * @return array<string, string>
     */
    private static function server(string $user = 'alice'): array
    {
        return ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_REMOTE_USER' => $user, 'HTTP_REMOTE_EMAIL' => $user.'@example.test'];
    }
}
