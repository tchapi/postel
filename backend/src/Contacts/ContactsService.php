<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Entity\Contact;
use App\Entity\ContactSync;
use App\Repository\ContactRepository;
use App\Repository\ContactSyncRepository;
use App\Security\RemoteUser;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Autocomplete reads a local copy of the user's Davis contacts. A CardDAV
 * request costs ~170 ms (Davis checks a bcrypt hash each time), so Davis is
 * only asked whether something changed, at most every few minutes, and after
 * the response has gone out. See docs/architecture.md.
 */
final class ContactsService implements EventSubscriberInterface
{
    private const string STALE_AFTER = '-5 minutes';
    private const int LIMIT = 8;

    /** @var array<string, RemoteUser> */
    private array $refreshAfterResponse = [];

    public function __construct(
        private readonly DavisConfig $config,
        private readonly CardDavClient $dav,
        private readonly ContactRepository $contacts,
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
     * @return array<string, array{name: ?string, photo: bool}>
     */
    public function lookup(RemoteUser $user, array $emails): array
    {
        if (!$this->config->enabled()) {
            return [];
        }

        return $this->contacts->namesByEmail($this->warm($user), $emails);
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

        return $this->contacts->findPhoto($user->getUserIdentifier(), $email);
    }

    /**
     * Makes sure the cache has been filled once, and queues a refresh when it is getting old.
     *
     * @return string the owner key of the cache
     */
    private function warm(RemoteUser $user): string
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
     * Fetches the address books whose sync token moved, drops the ones that
     * are gone. Davis being away is logged, not thrown: autocomplete keeps
     * what it has.
     */
    public function refresh(RemoteUser $user): void
    {
        $owner = $user->getUserIdentifier();
        $sync = $this->syncs->find($owner);
        if (null === $sync) {
            $sync = new ContactSync($owner);
            $this->entityManager->persist($sync);
        }
        // Even when it fails, so a Davis that is down is asked again in minutes, not on every keystroke
        $sync->checked(new DateTimeImmutable());

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
            foreach ($books as $book => $token) {
                if ('' !== $token && ($known[$book] ?? null) === $token) {
                    continue;
                }
                // Fetched before anything is dropped, so a failure leaves the book as it was
                $cards = $this->dav->cards($user, $book);
                $this->entityManager->wrapInTransaction(function () use ($owner, $book, $cards): void {
                    $this->contacts->deleteBook($owner, $book);
                    foreach ($cards as $card) {
                        foreach (VCard::addresses($card) as $address) {
                            $photo = $address['photo'];
                            $this->entityManager->persist(new Contact(
                                $owner,
                                $book,
                                $address['name'],
                                $address['email'],
                                null === $photo ? null : base64_encode($photo['data']),
                                $photo['mime'] ?? null,
                            ));
                        }
                    }
                });
                $known[$book] = $token;
            }
            foreach (array_keys(array_diff_key($known, $books)) as $gone) {
                $this->contacts->deleteBook($owner, $gone);
                unset($known[$gone]);
            }
            $sync->setBooks($known);
        } catch (DavisUnavailable $e) {
            $this->logger->warning('Contacts: Davis unavailable', ['exception' => $e, 'user' => $owner]);
        }

        $this->entityManager->flush();
    }

    public function onTerminate(): void
    {
        $users = $this->refreshAfterResponse;
        $this->refreshAfterResponse = [];
        foreach ($users as $user) {
            $this->refresh($user);
        }
    }
}
