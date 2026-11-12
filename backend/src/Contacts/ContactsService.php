<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Entity\Card;
use App\Entity\Contact;
use App\Entity\ContactSync;
use App\Repository\CardRepository;
use App\Repository\ContactRepository;
use App\Repository\ContactSyncRepository;
use App\Security\RemoteUser;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\KernelEvents;

use const ARRAY_FILTER_USE_BOTH;

/**
 * The address book and autocomplete read a local copy of the user's cards. A
 * CardDAV request to Davis costs ~170 ms (it checks a bcrypt hash each time),
 * so the server is only asked whether something changed, at most every few
 * minutes, and after the response has gone out. See docs/architecture.md.
 */
final class ContactsService implements EventSubscriberInterface
{
    private const string STALE_AFTER = '-5 minutes';
    private const int LIMIT = 8;

    /** Cards per addressbook-multiget, to keep each answer a reasonable size */
    private const int MULTIGET_SIZE = 100;

    /** @var array<string, RemoteUser> */
    private array $refreshAfterResponse = [];

    public function __construct(
        private readonly DavisConfig $config,
        private readonly CardDavClient $dav,
        private readonly ContactRepository $contacts,
        private readonly CardRepository $cards,
        private readonly ContactSyncRepository $syncs,
        private readonly EntityManagerInterface $entityManager,
        private readonly LoggerInterface $logger,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::TERMINATE => 'onTerminate'];
    }

    /**
     * @return list<Contact>
     */
    public function search(RemoteUser $user, string $query): array
    {
        if (!$this->config->enabled()) {
            return [];
        }

        return $this->contacts->search($this->warm($user), $query, self::LIMIT);
    }

    /**
     * For each address that is in the user's books: the name on file (null for
     * a card without one) and whether the card has a picture, so mail can show
     * people as the user knows them.
     *
     * @param list<string> $emails
     *
     * @return array<string, array{name: ?string, photo: bool, id: string}>
     */
    public function lookup(RemoteUser $user, array $emails): array
    {
        if (!$this->config->enabled()) {
            return [];
        }

        return $this->contacts->namesByEmail($this->warm($user), $emails);
    }

    /**
     * The user's address books, by name.
     *
     * @return list<array{id: string, href: string, name: string}>
     */
    public function books(string $owner): array
    {
        $books = [];
        foreach ($this->syncs->find($owner)?->getBooks() ?? [] as $href => $book) {
            // A book without a display name goes by the last part of its address
            $name = '' !== $book['name'] ? $book['name'] : rawurldecode(basename(rtrim($href, '/')));
            $books[] = ['id' => Card::idFor($owner, $href), 'href' => $href, 'name' => $name];
        }
        usort($books, static fn (array $a, array $b) => strnatcasecmp($a['name'], $b['name']));

        return $books;
    }

    /**
     * @return ?array{id: string, href: string, name: string}
     */
    public function book(string $owner, string $id): ?array
    {
        foreach ($this->books($owner) as $book) {
            if ($book['id'] === $id) {
                return $book;
            }
        }

        return null;
    }

    /**
     * False when the last refresh could not reach the server.
     */
    public function available(string $owner): bool
    {
        return $this->syncs->find($owner)?->isAvailable() ?? false;
    }

    /**
     * The picture on the card of this address, from the cache as it is.
     *
     * @return ?array{mime: string, data: string}
     */
    public function photo(RemoteUser $user, string $email): ?array
    {
        if (!$this->config->enabled()) {
            return null;
        }
        $owner = $user->getUserIdentifier();
        $id = $this->contacts->findCardWithPhoto($owner, $email);
        $card = null === $id ? null : $this->cards->findOwned($owner, $id);
        if (null === $card) {
            return null;
        }

        try {
            return CardDocument::fromString($card->getVcard())->photo();
        } catch (InvalidCard) {
            return null;
        }
    }

    /**
     * Makes sure the cache has been filled once, and queues a refresh when it is getting old.
     *
     * @return string the owner key of the cache
     */
    public function warm(RemoteUser $user): string
    {
        $owner = $user->getUserIdentifier();
        $checkedAt = $this->syncs->find($owner)?->getCheckedAt();
        if (null === $checkedAt) {
            // Nothing to show yet: this first one is worth the wait
            $this->refresh($user);
        } elseif ($checkedAt < new DateTimeImmutable(self::STALE_AFTER)) {
            $this->refreshAfterResponse[$owner] = $user;
        }

        return $owner;
    }

    /**
     * Brings the cache in line with the server: for each book whose sync
     * token moved (or that has none), the ETags of its cards are compared
     * with the cached ones and only the cards that differ are fetched. The
     * server being away is logged, not thrown: the cache stays as it was.
     *
     * @return bool whether any card or book changed
     */
    public function refresh(RemoteUser $user): bool
    {
        $owner = $user->getUserIdentifier();
        $sync = $this->syncs->find($owner);
        if (null === $sync) {
            $sync = new ContactSync($owner);
            $this->entityManager->persist($sync);
        }
        // Even when it fails, so a server that is down is asked again in minutes, not on every keystroke
        $sync->checked(new DateTimeImmutable());

        $changed = false;
        try {
            $cached = $sync->getHome();
            $home = $cached ?? $this->dav->home($user);
            try {
                $books = $this->dav->books($user, $home);
            } catch (DavisUnavailable $e) {
                if (null === $cached) {
                    throw $e;
                }
                // The home may have moved since: look it up again, once
                $home = $this->dav->home($user);
                $books = $this->dav->books($user, $home);
            }
            $sync->setHome($home);

            $known = $sync->getBooks();
            foreach ($books as $book => $state) {
                $previous = $known[$book] ?? null;
                if (null === $previous || $previous['name'] !== $state['name']) {
                    $changed = true;
                }
                if ('' === $state['token'] || ($previous['token'] ?? null) !== $state['token']) {
                    $changed = $this->syncBook($user, $book) || $changed;
                }
                // Saved after each book, so a failure on the next one does not fetch this one again
                $known[$book] = $state;
                $sync->setBooks($known);
            }
            foreach (array_keys(array_diff_key($known, $books)) as $gone) {
                $this->contacts->deleteBook($owner, $gone);
                $this->cards->deleteBook($owner, $gone);
                unset($known[$gone]);
                $changed = true;
            }
            $sync->setBooks($known);
            $sync->setAvailable(true);
        } catch (DavisUnavailable $e) {
            $this->logger->warning('Contacts: address book server unavailable', ['exception' => $e, 'user' => $owner]);
            $sync->setAvailable(false);
        }

        $this->entityManager->flush();

        return $changed;
    }

    /**
     * Puts a card in the cache as the server has it, or updates it.
     */
    public function store(string $owner, string $book, string $href, string $etag, string $vcard): void
    {
        $card = $this->cards->findOwned($owner, Card::idFor($owner, $href));
        if (null === $card) {
            $card = new Card($owner, $book, $href, $etag, $vcard);
            $this->entityManager->persist($card);
        } else {
            $card->replace($etag, $vcard);
            $this->contacts->deleteCard($owner, $card->getId());
        }

        try {
            $summary = CardDocument::fromString($vcard)->summary();
        } catch (InvalidCard) {
            // Kept anyway, under what the simple reader finds in it
            $addresses = VCard::addresses($vcard);
            $emails = array_column($addresses, 'email');
            $summary = ['name' => $addresses[0]['name'] ?? $emails[0] ?? null, 'org' => null, 'emails' => $emails, 'phones' => [], 'hasPhoto' => false];
        }
        $card->describe($summary['name'], $summary['org'], $summary['emails'], $summary['phones'], $summary['hasPhoto']);

        // Autocomplete keeps one row per address, as it always did
        foreach (VCard::addresses($vcard) as $address) {
            $this->entityManager->persist(new Contact($owner, $book, $address['name'], $address['email'], $card->getId(), $summary['hasPhoto']));
        }
    }

    public function forget(Card $card): void
    {
        $this->contacts->deleteCard($card->getOwner(), $card->getId());
        $this->entityManager->remove($card);
    }

    public function onTerminate(): void
    {
        $users = $this->refreshAfterResponse;
        $this->refreshAfterResponse = [];
        foreach ($users as $user) {
            $this->refresh($user);
        }
    }

    /**
     * @return bool whether any card changed
     */
    private function syncBook(RemoteUser $user, string $book): bool
    {
        $owner = $user->getUserIdentifier();
        $cached = $this->cards->byHref($owner, $book);

        // Everything is fetched before anything is dropped, so a failure leaves the book as it was
        if ([] === $cached) {
            $fetched = $this->dav->all($user, $book);
            $gone = [];
        } else {
            $etags = $this->dav->etags($user, $book);
            $stale = array_keys(array_filter($etags, static fn (string $etag, string $href) => $etag !== ($cached[$href] ?? null)?->getEtag(), ARRAY_FILTER_USE_BOTH));
            $fetched = [];
            foreach (array_chunk($stale, self::MULTIGET_SIZE) as $hrefs) {
                $fetched += $this->dav->multiget($user, $book, array_map(strval(...), $hrefs));
            }
            $gone = array_diff_key($cached, $etags);
        }
        if ([] === $fetched && [] === $gone) {
            return false;
        }

        $this->entityManager->wrapInTransaction(function () use ($owner, $book, $fetched, $gone): void {
            foreach ($gone as $card) {
                $this->forget($card);
            }
            foreach ($fetched as $href => $card) {
                $this->store($owner, $book, $href, $card['etag'], $card['vcard']);
            }
        });

        return true;
    }
}
