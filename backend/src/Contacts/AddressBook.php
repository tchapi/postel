<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Contacts\Request\CardInput;
use App\Entity\Card;
use App\Repository\CardRepository;
use App\Security\RemoteUser;
use Doctrine\ORM\EntityManagerInterface;

use function array_slice;
use function chr;
use function count;
use function ord;

/**
 * Changes to the address book. Each goes to the server first, conditional
 * on the ETag the user's edit was made on, and only then to the cache: a
 * failed write leaves the cache as it was.
 *
 * A change is made on the cached card, so it is only sent when the cache
 * holds the version the user saw. When it does not, or when the server says
 * the card moved on, that one card is read again: the user then sees what
 * changed and can try again on it.
 *
 * Every card and book is looked up in the cache by id and owner, so the
 * hrefs written to come from the server, never from the client.
 */
final class AddressBook
{
    public const int IMPORT_MAX_BYTES = 10_000_000;
    public const int IMPORT_MAX_CARDS = 5_000;

    public function __construct(
        private readonly CardDavClient $dav,
        private readonly ContactsService $contacts,
        private readonly CardRepository $cards,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * @throws CardGone when the book is not known
     */
    public function create(RemoteUser $user, string $bookId, CardInput $input): Card
    {
        $book = $this->book($user, $bookId);
        $uid = self::uuid();
        $card = CardDocument::blank($uid);
        $card->apply($input);

        return $this->write($user, $book, $book.$uid.'.vcf', $card->toString(), null);
    }

    public function update(RemoteUser $user, string $id, string $etag, CardInput $input): Card
    {
        return $this->change($user, $id, $etag, static fn (CardDocument $card) => $card->apply($input));
    }

    public function setPhoto(RemoteUser $user, string $id, string $etag, string $jpeg): Card
    {
        return $this->change($user, $id, $etag, static fn (CardDocument $card) => $card->setPhoto($jpeg));
    }

    public function removePhoto(RemoteUser $user, string $id, string $etag): Card
    {
        return $this->change($user, $id, $etag, static fn (CardDocument $card) => $card->removePhoto());
    }

    /**
     * @return string the card as it was, so the user can undo
     */
    public function delete(RemoteUser $user, string $id, string $etag): string
    {
        $card = $this->seen($user, $id, $etag);
        $this->remove($user, $card);
        $this->entityManager->flush();

        return $card->getVcard();
    }

    /**
     * Two cards of the same person become one: the first takes in what the
     * other has and it lacks, then the other is deleted. In that order, so
     * that a failure half way leaves a card too many, never one too few.
     */
    public function merge(RemoteUser $user, string $id, string $etag, string $otherId, string $otherEtag): Card
    {
        $card = $this->seen($user, $id, $etag);
        $other = $this->seen($user, $otherId, $otherEtag);

        $document = CardDocument::fromString($card->getVcard());
        $document->absorb(CardDocument::fromString($other->getVcard()));

        $merged = $this->rewrite($user, $card, $document);
        $this->remove($user, $other);
        $this->entityManager->flush();

        return $merged;
    }

    /**
     * Adds every card of a .vcf file to a book, as new cards. A card that
     * cannot be read, or that the server refuses, is counted and skipped.
     *
     * @return array{imported: int, failed: int}
     */
    public function import(RemoteUser $user, string $bookId, string $file): array
    {
        $book = $this->book($user, $bookId);
        $taken = $this->cards->uids($user->getUserIdentifier(), $book);

        $texts = CardDocument::splitAll($file);
        $imported = 0;
        // Cards past the limit are not tried, and say so
        $failed = max(0, count($texts) - self::IMPORT_MAX_CARDS);
        foreach (array_slice($texts, 0, self::IMPORT_MAX_CARDS) as $text) {
            try {
                $document = CardDocument::fromString($text);
            } catch (InvalidCard) {
                ++$failed;
                continue;
            }
            // A UID already in the book would make the server or other apps mix the two up
            $uid = $document->uid();
            if (null === $uid || isset($taken[$uid])) {
                $uid = self::uuid();
                $document->replaceUid($uid);
            }
            $taken[$uid] = true;

            try {
                // The file name is new, never taken from the card
                $this->write($user, $book, $book.self::uuid().'.vcf', $document->toString(), null);
                ++$imported;
            } catch (CardRefused|CardChanged) {
                ++$failed;
            }
        }

        return ['imported' => $imported, 'failed' => $failed];
    }

    /**
     * @param callable(CardDocument): void $edit
     */
    private function change(RemoteUser $user, string $id, string $etag, callable $edit): Card
    {
        $card = $this->seen($user, $id, $etag);
        $document = CardDocument::fromString($card->getVcard());
        $edit($document);

        return $this->rewrite($user, $card, $document);
    }

    /**
     * The cached card, if it is the version the user's change was made on.
     *
     * @throws CardChanged when it is not: the cache then has the card as it is now
     * @throws CardGone    when there is no such card any more
     */
    private function seen(RemoteUser $user, string $id, string $etag): Card
    {
        $card = $this->card($user, $id);
        if ($card->getEtag() !== $etag) {
            $this->readAgain($user, $card);
            throw new CardChanged('The card is not at version '.$etag.' any more');
        }

        return $card;
    }

    private function rewrite(RemoteUser $user, Card $card, CardDocument $document): Card
    {
        try {
            return $this->write($user, $card->getBook(), $card->getHref(), $document->toString(), $card->getEtag());
        } catch (CardChanged $e) {
            $this->readAgain($user, $card);
            throw $e;
        }
    }

    private function remove(RemoteUser $user, Card $card): void
    {
        try {
            $this->dav->delete($user, $card->getHref(), $card->getEtag());
        } catch (CardChanged $e) {
            $this->readAgain($user, $card);
            throw $e;
        }
        $this->contacts->forget($card);
    }

    /**
     * The server has another version of this card than the cache: fetch it,
     * so the next thing the user sees and edits is the card as it is.
     *
     * @throws CardGone when the card is gone from the server; it leaves the cache too
     */
    private function readAgain(RemoteUser $user, Card $card): void
    {
        try {
            $now = $this->dav->get($user, $card->getHref());
            $this->contacts->store($card->getOwner(), $card->getBook(), $card->getHref(), $now['etag'], $now['vcard']);
        } catch (CardGone $e) {
            $this->contacts->forget($card);
            $this->entityManager->flush();
            throw $e;
        } catch (DavisUnavailable) {
            // The regular sync will catch up
            return;
        }
        $this->entityManager->flush();
    }

    /**
     * PUT, then the cache. Without an ETag in the answer the server may have
     * changed the card on the way in, so it is read back once.
     */
    private function write(RemoteUser $user, string $book, string $href, string $vcard, ?string $ifMatch): Card
    {
        $etag = $this->dav->put($user, $href, $vcard, $ifMatch);
        if (null === $etag) {
            ['etag' => $etag, 'vcard' => $vcard] = $this->dav->get($user, $href);
        }
        $card = $this->contacts->store($user->getUserIdentifier(), $book, $href, $etag, $vcard);
        $this->entityManager->flush();

        return $card;
    }

    /**
     * A random UUID (version 4), for new UIDs and file names.
     */
    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr(ord($bytes[6]) & 0x0F | 0x40);
        $bytes[8] = chr(ord($bytes[8]) & 0x3F | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    private function card(RemoteUser $user, string $id): Card
    {
        return $this->cards->findOwned($user->getUserIdentifier(), $id) ?? throw new CardGone('No card '.$id);
    }

    /**
     * @return string the book's href
     */
    private function book(RemoteUser $user, string $id): string
    {
        return ($this->contacts->book($user->getUserIdentifier(), $id) ?? throw new CardGone('No book '.$id))['href'];
    }
}
