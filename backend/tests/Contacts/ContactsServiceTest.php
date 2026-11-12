<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Contacts\CardDavClient;
use App\Contacts\ContactsService;
use App\Contacts\DavisConfig;
use App\Entity\Card;
use App\Entity\Contact;
use App\Entity\ContactSync;
use App\Repository\CardRepository;
use App\Repository\ContactRepository;
use App\Repository\ContactSyncRepository;
use App\Security\RemoteUser;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpClient\MockHttpClient;

/**
 * Against a fake address book server: the requests it gets tell what the cache asked for.
 */
final class ContactsServiceTest extends KernelTestCase
{
    private const string URL = 'https://dav.example.test/dav/';
    private const string HOME = '/dav/addressbooks/alice/';
    private const string BOOK = self::HOME.'contacts/';

    private RemoteUser $user;
    private EntityManagerInterface $entityManager;
    private FakeCardDav $dav;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->user = new RemoteUser('alice', 'alice@example.test');
        $this->entityManager = self::getContainer()->get(EntityManagerInterface::class);
        $this->entityManager->createQuery('DELETE FROM App\Entity\Contact')->execute();
        $this->entityManager->createQuery('DELETE FROM App\Entity\Card')->execute();
        $this->entityManager->createQuery('DELETE FROM App\Entity\ContactSync')->execute();

        $this->dav = new FakeCardDav(self::HOME);
        $this->dav->books[self::BOOK] = ['token' => 'token-1', 'name' => 'Contacts'];
        $this->dav->cards[self::BOOK] = [
            self::BOOK.'emile.vcf' => FakeCardDav::card('Émile Durand', 'emile@example.test'),
            self::BOOK.'bob.vcf' => FakeCardDav::card('Bob Martin', 'bob@example.test'),
        ];
    }

    public function testTheFirstSearchFillsTheCache(): void
    {
        $found = $this->service()->search($this->user, 'emile');

        self::assertSame(['emile@example.test'], array_map(static fn (Contact $c) => $c->getEmail(), $found));
        self::assertSame(['PROPFIND /dav/', 'PROPFIND /dav/principals/alice/', 'PROPFIND '.self::HOME, 'REPORT '.self::BOOK.' query with cards'], $this->dav->take());
    }

    public function testAnUnchangedBookIsNotFetchedAgain(): void
    {
        $service = $this->service();
        $service->refresh($this->user);
        $this->dav->take();

        self::assertFalse($service->refresh($this->user));

        self::assertSame(['PROPFIND '.self::HOME], $this->dav->take(), 'the home is remembered, the cards are not fetched');
    }

    public function testAChangedCardIsFetchedAlone(): void
    {
        $service = $this->service();
        $service->refresh($this->user);
        $this->dav->take();

        $this->dav->books[self::BOOK] = ['token' => 'token-2', 'name' => 'Contacts'];
        $this->dav->cards[self::BOOK][self::BOOK.'bob.vcf'] = FakeCardDav::card('Bob Martin', 'bob@new.example');
        self::assertTrue($service->refresh($this->user));

        self::assertSame(['PROPFIND '.self::HOME, 'REPORT '.self::BOOK.' query with ETags', 'REPORT '.self::BOOK.' multiget '.self::BOOK.'bob.vcf'], $this->dav->take());
        self::assertSame(['bob@new.example', 'emile@example.test'], $this->cached());
        self::assertSame(['Bob Martin', 'Émile Durand'], array_map(static fn (Card $c) => $c->getName(), $this->cards()));
    }

    public function testADeletedCardDisappears(): void
    {
        $service = $this->service();
        $service->refresh($this->user);

        $this->dav->books[self::BOOK] = ['token' => 'token-2', 'name' => 'Contacts'];
        unset($this->dav->cards[self::BOOK][self::BOOK.'bob.vcf']);
        $this->dav->take();
        $service->refresh($this->user);

        self::assertSame(['PROPFIND '.self::HOME, 'REPORT '.self::BOOK.' query with ETags'], $this->dav->take(), 'nothing to fetch');
        self::assertSame(['emile@example.test'], $this->cached());
        self::assertCount(1, $this->cards());
    }

    public function testACardWithoutEmailIsCached(): void
    {
        $this->dav->cards[self::BOOK][self::BOOK.'plumber.vcf'] = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:plumber\r\nFN:Plumber\r\nORG:Fix-It\r\nTEL;TYPE=WORK:+33 4 00 00 00 02\r\nEND:VCARD\r\n";

        $this->service()->refresh($this->user);

        $card = self::getContainer()->get(CardRepository::class)->findOwned('alice', Card::idFor('alice', self::BOOK.'plumber.vcf'));
        self::assertNotNull($card);
        self::assertSame(['Plumber', 'Fix-It', [], ['+33 4 00 00 00 02']], [$card->getName(), $card->getOrg(), $card->getEmails(), $card->getPhones()]);
        self::assertSame(['bob@example.test', 'emile@example.test'], $this->cached(), 'no autocomplete row without an address');
    }

    public function testABookWithoutSyncTokenIsComparedEveryTime(): void
    {
        $this->dav->books[self::BOOK] = ['token' => '', 'name' => 'Contacts'];
        $service = $this->service();
        $service->refresh($this->user);
        $this->dav->take();

        self::assertFalse($service->refresh($this->user));
        self::assertSame(['PROPFIND '.self::HOME, 'REPORT '.self::BOOK.' query with ETags'], $this->dav->take());

        $this->dav->cards[self::BOOK][self::BOOK.'carol.vcf'] = FakeCardDav::card('Carol Petit', 'carol@example.test');
        self::assertTrue($service->refresh($this->user));
        self::assertSame(['bob@example.test', 'carol@example.test', 'emile@example.test'], $this->cached());
    }

    public function testAGoneBookIsDroppedAndBooksHaveTheirName(): void
    {
        $this->dav->books[self::HOME.'work/'] = ['token' => 'w-1', 'name' => 'Work'];
        $this->dav->cards[self::HOME.'work/'] = [self::HOME.'work/carol.vcf' => FakeCardDav::card('Carol Petit', 'carol@work.example')];
        $service = $this->service();
        $service->refresh($this->user);
        self::assertSame(['Contacts', 'Work'], array_column($this->sync()->getBooks(), 'name'));

        unset($this->dav->books[self::HOME.'work/']);
        $service->refresh($this->user);

        self::assertSame(['bob@example.test', 'emile@example.test'], $this->cached());
        self::assertSame([self::BOOK, self::BOOK], array_map(static fn (Card $c) => $c->getBook(), $this->cards()));
        self::assertSame([self::BOOK], array_keys($this->sync()->getBooks()));
    }

    public function testAServerAwayKeepsTheCacheAndSaysSo(): void
    {
        $service = $this->service();
        $service->refresh($this->user);
        self::assertTrue($this->sync()->isAvailable());

        $this->dav->status = 401;
        $service->refresh($this->user);

        self::assertSame(['bob@example.test', 'emile@example.test'], $this->cached());
        self::assertCount(2, $this->cards());
        self::assertFalse($this->sync()->isAvailable());

        $this->dav->status = 207;
        $service->refresh($this->user);
        self::assertTrue($this->sync()->isAvailable());
    }

    public function testTheLookupNamesTheAddressesOnFile(): void
    {
        $this->dav->cards[self::BOOK][self::BOOK.'nameless.vcf'] = FakeCardDav::card('', 'nameless@example.test');

        $names = $this->service()->lookup($this->user, ['Bob@Example.test', 'nameless@example.test', 'stranger@example.test']);
        ksort($names);

        self::assertSame([
            'bob@example.test' => ['name' => 'Bob Martin', 'photo' => false],
            'nameless@example.test' => ['name' => null, 'photo' => false],
        ], $names);
    }

    public function testThePictureOnACardIsKeptAndServed(): void
    {
        $png = "\x89PNG\r\n\x1a\n";
        $this->dav->cards[self::BOOK][self::BOOK.'pic.vcf'] = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pic\r\nPHOTO;ENCODING=b;TYPE=PNG:".base64_encode($png)."\r\nEMAIL:pic@example.test\r\nEND:VCARD\r\n";
        $service = $this->service();

        self::assertSame(['pic@example.test' => ['name' => 'Pic', 'photo' => true]], $service->lookup($this->user, ['pic@example.test']));
        self::assertSame(['mime' => 'image/png', 'data' => $png], $service->photo($this->user, 'PIC@example.test'));
        self::assertSame([false, false, true], array_map(static fn (Card $c) => $c->hasPhoto(), $this->cards()));
        self::assertNull($service->photo($this->user, 'bob@example.test'));
    }

    public function testNothingIsAskedWhenDavisIsNotConfigured(): void
    {
        $service = $this->service(new DavisConfig('', '', ''));

        self::assertSame([], $service->search($this->user, 'bob'));
        self::assertSame([], $this->dav->take());
    }

    public function testAWordStartingWithTheQueryComesFirst(): void
    {
        $this->dav->cards[self::BOOK][self::BOOK.'rob.vcf'] = FakeCardDav::card('Rob Ober', 'rob@example.test');

        $found = $this->service()->search($this->user, 'ob');

        // Both contain "ob", only Ober starts with it
        self::assertSame(['rob@example.test', 'bob@example.test'], array_map(static fn (Contact $c) => $c->getEmail(), $found));
    }

    /**
     * @return list<string>
     */
    private function cached(): array
    {
        $this->entityManager->clear();
        $all = self::getContainer()->get(ContactRepository::class)->findBy(['owner' => 'alice'], ['email' => 'ASC']);

        return array_map(static fn (Contact $c) => $c->getEmail(), $all);
    }

    /**
     * @return list<Card>
     */
    private function cards(): array
    {
        $this->entityManager->clear();

        return self::getContainer()->get(CardRepository::class)->findAllOwned('alice');
    }

    private function sync(): ContactSync
    {
        $sync = self::getContainer()->get(ContactSyncRepository::class)->find('alice');
        self::assertNotNull($sync);

        return $sync;
    }

    private function service(?DavisConfig $config = null): ContactsService
    {
        $config ??= new DavisConfig(self::URL, 'app_test', 'secret');

        return new ContactsService(
            $config,
            new CardDavClient(new MockHttpClient($this->dav), $config),
            self::getContainer()->get(ContactRepository::class),
            self::getContainer()->get(CardRepository::class),
            self::getContainer()->get(ContactSyncRepository::class),
            $this->entityManager,
            new NullLogger(),
        );
    }
}
