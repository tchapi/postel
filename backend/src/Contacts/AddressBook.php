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
 * refused or failed write leaves the cache as it was.
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
        $card = $this->card($user, $id);
        $document = CardDocument::fromString($card->getVcard());
        $document->apply($input);

        return $this->write($user, $card->getBook(), $card->getHref(), $document->toString(), $etag);
    }

    public function setPhoto(RemoteUser $user, string $id, string $etag, string $jpeg): Card
    {
        $card = $this->card($user, $id);
        $document = CardDocument::fromString($card->getVcard());
        $document->setPhoto($jpeg);

        return $this->write($user, $card->getBook(), $card->getHref(), $document->toString(), $etag);
    }

    public function removePhoto(RemoteUser $user, string $id, string $etag): Card
    {
        $card = $this->card($user, $id);
        $document = CardDocument::fromString($card->getVcard());
        $document->removePhoto();

        return $this->write($user, $card->getBook(), $card->getHref(), $document->toString(), $etag);
    }

    /**
     * @return string the card as it was, so the user can undo
     */
    public function delete(RemoteUser $user, string $id, string $etag): string
    {
        $card = $this->card($user, $id);
        $this->dav->delete($user, $card->getHref(), $etag);
        $vcard = $card->getVcard();
        $this->contacts->forget($card);
        $this->entityManager->flush();

        return $vcard;
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
