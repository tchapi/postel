<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Entity\Card;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

use const IMAGETYPE_JPEG;
use const JSON_THROW_ON_ERROR;

/**
 * Changes go to the fake server first, with the ETag the client had, and
 * reach the cache only once the server took them.
 */
final class ContactCardsWriteTest extends WebTestCase
{
    private const string BOOK = '/dav/addressbooks/alice/contacts/';
    private const string EMILE = self::BOOK.'emile.vcf';

    private KernelBrowser $client;
    private FakeCardDav $dav;

    protected function setUp(): void
    {
        $this->client = self::createClient();
        $this->client->disableReboot();
        $entityManager = self::getContainer()->get(EntityManagerInterface::class);
        foreach (['Contact', 'Card', 'ContactSync'] as $entity) {
            $entityManager->createQuery('DELETE FROM App\Entity\\'.$entity)->execute();
        }

        /** @psalm-suppress ServiceNotFound it is only a service in the test environment */
        $dav = self::getContainer()->get(FakeCardDav::class);
        self::assertInstanceOf(FakeCardDav::class, $dav);
        $this->dav = $dav;
        $this->dav->books = [self::BOOK => ['token' => 't1', 'name' => 'Contacts']];
        $this->dav->cards = [self::BOOK => [self::EMILE => (string) file_get_contents(__DIR__.'/../Fixtures/vcard/plain-3.0.vcf')]];
        $this->request('GET', '/api/contacts/cards');
        $this->dav->take();
    }

    public function testANewCardGoesToTheBookOnlyIfNothingIsThere(): void
    {
        $this->request('POST', '/api/contacts/cards', ['book' => self::id(self::BOOK), 'firstName' => 'Zoé', 'lastName' => 'Lambert', 'emails' => [['value' => 'zoe@example.test', 'type' => 'home']]]);

        self::assertResponseStatusCodeSame(201);
        $card = $this->json();
        self::assertSame('Zoé Lambert', $card['name']);
        self::assertSame(['If-None-Match' => '*'], $this->dav->conditions());
        $href = array_keys($this->dav->cards[self::BOOK])[1];
        self::assertMatchesRegularExpression('#^'.self::BOOK.'[0-9a-f-]{36}\.vcf$#', $href);
        self::assertSame(self::id($href), $card['id']);
        self::assertSame(FakeCardDav::etag($this->dav->cards[self::BOOK][$href]), $card['etag']);
        self::assertStringContainsString("EMAIL;TYPE=HOME:zoe@example.test\r\n", $this->dav->cards[self::BOOK][$href]);
        self::assertSame(['Émile Durand', 'Zoé Lambert'], array_column($this->list(), 'name'));
    }

    public function testAnEditIsWrittenOverTheVersionTheClientSaw(): void
    {
        $card = $this->card(self::EMILE);

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], ['title' => 'Chief'] + $card);

        self::assertResponseIsSuccessful();
        self::assertSame(['If-Match' => self::etagOf($card)], $this->dav->conditions());
        self::assertSame('Chief', $this->json()['title']);
        self::assertSame(FakeCardDav::etag($this->dav->cards[self::BOOK][self::EMILE]), $this->json()['etag']);
        self::assertSame(['PUT '.self::EMILE], $this->dav->take(), 'the answer had an ETag, nothing to read back');
    }

    public function testACardChangedElsewhereIsAConflictAndTheCacheStays(): void
    {
        $card = $this->card(self::EMILE);
        $this->dav->cards[self::BOOK][self::EMILE] = str_replace('TITLE:Engineer', 'TITLE:Changed elsewhere', $this->dav->cards[self::BOOK][self::EMILE]);

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], ['title' => 'Chief'] + $card);

        self::assertResponseStatusCodeSame(409);
        self::assertSame('contact_changed', $this->json()['error']);
        self::assertSame($card, $this->card(self::EMILE));
        self::assertStringContainsString('Changed elsewhere', $this->dav->cards[self::BOOK][self::EMILE]);
    }

    public function testWithoutAnEtagInTheAnswerTheCardIsReadBack(): void
    {
        $card = $this->card(self::EMILE);
        $this->dav->rewrites = true;

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], ['title' => 'Chief'] + $card);

        self::assertResponseIsSuccessful();
        self::assertSame(['PUT '.self::EMILE, 'GET '.self::EMILE], $this->dav->take());
        self::assertSame(FakeCardDav::etag($this->dav->cards[self::BOOK][self::EMILE]), $this->json()['etag']);
        $this->request('GET', '/api/contacts/cards/'.$card['id'].'/vcf');
        self::assertStringContainsString('X-SERVER:was here', (string) $this->client->getResponse()->getContent());
    }

    public function testAFailedWriteLeavesTheCache(): void
    {
        $card = $this->card(self::EMILE);
        $this->dav->failing = ['PUT' => 503];

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], ['title' => 'Chief'] + $card);

        self::assertResponseStatusCodeSame(502);
        self::assertSame('contacts_unavailable', $this->json()['error']);
        self::assertSame($card, $this->card(self::EMILE));
    }

    public function testAnEditWithoutItsEtagOrOnSomeoneElsesCardIsRefused(): void
    {
        $card = $this->card(self::EMILE);

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], ['etag' => null] + $card);
        self::assertResponseStatusCodeSame(422);

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], $card, 'bob');
        self::assertResponseStatusCodeSame(404);
        $this->request('DELETE', '/api/contacts/cards/'.$card['id'].'?etag='.urlencode($card['etag']), user: 'bob');
        self::assertResponseStatusCodeSame(404);
        self::assertSame([], array_values(array_filter($this->dav->take(), static fn (string $r) => !str_starts_with($r, 'PROPFIND'))), 'nothing was written');
    }

    public function testAutocompleteFollowsAnEditedAddress(): void
    {
        $card = $this->card(self::EMILE);
        $card['emails'][0]['value'] = 'emile@new.example';

        $this->request('PUT', '/api/contacts/cards/'.$card['id'], $card);
        self::assertResponseIsSuccessful();

        $this->request('GET', '/api/contacts?q=emile');
        self::assertSame(['emile@home.example', 'emile@new.example'], array_column($this->json(), 'email'));
    }

    public function testThePictureIsSavedAsASmallJpeg(): void
    {
        $card = $this->card(self::EMILE);
        $image = imagecreatetruecolor(1600, 900);
        self::assertNotFalse($image);
        $file = (string) tempnam(sys_get_temp_dir(), 'pic');
        imagepng($image, $file);

        $this->client->request('PUT', '/api/contacts/cards/'.$card['id'].'/photo', ['etag' => $card['etag']], ['file' => new UploadedFile($file, 'me.png', 'image/png', null, true)], self::server());

        self::assertResponseIsSuccessful();
        self::assertTrue($this->json()['photo']);
        $this->request('GET', '/api/contacts/cards/'.$card['id'].'/photo');
        $size = getimagesizefromstring((string) $this->client->getResponse()->getContent());
        self::assertNotFalse($size);
        self::assertSame([512, 288, IMAGETYPE_JPEG], [$size[0], $size[1], $size[2]]);
        self::assertStringContainsString('PHOTO;ENCODING=b;TYPE=JPEG:/9j/', $this->dav->cards[self::BOOK][self::EMILE]);

        $etag = $this->card(self::EMILE)['etag'];
        $this->request('DELETE', '/api/contacts/cards/'.$card['id'].'/photo?etag='.urlencode($etag));
        self::assertFalse($this->json()['photo']);
        self::assertStringNotContainsString('PHOTO', $this->dav->cards[self::BOOK][self::EMILE]);
    }

    public function testSomethingElseThanAnImageIsRefused(): void
    {
        $card = $this->card(self::EMILE);
        $file = (string) tempnam(sys_get_temp_dir(), 'pic');
        file_put_contents($file, '<svg xmlns="http://www.w3.org/2000/svg"/>');

        $this->client->request('PUT', '/api/contacts/cards/'.$card['id'].'/photo', ['etag' => $card['etag']], ['file' => new UploadedFile($file, 'me.svg', 'image/svg+xml', null, true)], self::server());

        self::assertResponseStatusCodeSame(422);
        self::assertSame([], $this->dav->take());
    }

    public function testADeletedCardComesBackWithItsTextAndCanBeImportedAgain(): void
    {
        $card = $this->card(self::EMILE);

        $this->request('DELETE', '/api/contacts/cards/'.$card['id'].'?etag='.urlencode($card['etag']));

        self::assertResponseIsSuccessful();
        self::assertSame(['If-Match' => self::etagOf($card)], $this->dav->conditions());
        $vcard = $this->json()['vcard'];
        self::assertIsString($vcard);
        self::assertStringContainsString('UID:plain-30', $vcard);
        self::assertSame([], $this->list());

        self::assertSame(['imported' => 1, 'failed' => 0], $this->import($vcard));
        self::assertSame(['Émile Durand'], array_column($this->list(), 'name'));
        self::assertStringContainsString('UID:plain-30', (string) current($this->dav->cards[self::BOOK]), 'the UID was free again');
    }

    public function testAnImportCountsTheCardsThatFailed(): void
    {
        $file = (string) file_get_contents(__DIR__.'/../Fixtures/vcard/plain-3.0.vcf') // UID already in the book
            .(string) file_get_contents(__DIR__.'/../Fixtures/vcard/no-email.vcf')
            ."BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Refused by the server\r\nEND:VCARD\r\n"
            ."BEGIN:VCARD\r\nthis is not a vCard\r\nEND:VCARD\r\n";

        self::assertSame(['imported' => 2, 'failed' => 2], $this->import($file));

        $cards = $this->dav->cards[self::BOOK];
        self::assertCount(3, $cards);
        self::assertSame(1, substr_count(implode('', $cards), 'UID:plain-30'), 'the copy got a UID of its own');
        self::assertSame(['Émile Durand', 'Émile Durand', 'Plumber'], array_column($this->list(), 'name'));
    }

    /**
     * @return array{imported: int, failed: int}
     */
    private function import(string $vcf): array
    {
        $file = (string) tempnam(sys_get_temp_dir(), 'vcf');
        file_put_contents($file, $vcf);
        $this->client->request('POST', '/api/contacts/books/'.self::id(self::BOOK).'/import', files: ['file' => new UploadedFile($file, 'cards.vcf', 'text/vcard', null, true)], server: self::server());
        self::assertResponseIsSuccessful();
        $result = $this->json();
        self::assertIsInt($result['imported']);
        self::assertIsInt($result['failed']);

        return ['imported' => $result['imported'], 'failed' => $result['failed']];
    }

    /**
     * @return array<string, mixed>
     */
    private function card(string $href): array
    {
        $this->request('GET', '/api/contacts/cards/'.self::id($href));
        self::assertResponseIsSuccessful();

        return $this->json();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function list(): array
    {
        $this->request('GET', '/api/contacts/cards');
        $cards = $this->json()['cards'];
        self::assertIsArray($cards);

        return array_values(array_filter($cards, is_array(...)));
    }

    /**
     * @param array<string, mixed> $card
     */
    private static function etagOf(array $card): string
    {
        self::assertIsString($card['etag']);

        return $card['etag'];
    }

    private static function id(string $href): string
    {
        return Card::idFor('alice', $href);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function request(string $method, string $uri, array $payload = [], string $user = 'alice'): void
    {
        $this->client->request($method, $uri, server: self::server($user) + ['CONTENT_TYPE' => 'application/json'], content: [] === $payload ? null : json_encode($payload, JSON_THROW_ON_ERROR));
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
