<?php

declare(strict_types=1);

namespace App\Controller;

use App\Contacts\AddressBook;
use App\Contacts\CardDocument;
use App\Contacts\ContactsService;
use App\Contacts\DavisConfig;
use App\Contacts\InvalidCard;
use App\Contacts\Picture;
use App\Contacts\Request\CardInput;
use App\Contacts\Request\Etag;
use App\Entity\Card;
use App\Repository\CardRepository;
use App\Security\RemoteUser;
use InvalidArgumentException;
use Normalizer;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

use function in_array;

/**
 * The address book: its cards from the cache, read and downloaded, and
 * changes, which AddressBook writes to the server first. Every card is
 * looked up by id and owner, so another user's id is not found.
 */
#[Route('/api/contacts')]
final class ContactCardsController
{
    private const string ID = '[a-f0-9]{32}';

    /** Larger pictures are refused before they are decoded */
    private const int PHOTO_MAX_BYTES = 20_000_000;

    public function __construct(
        private readonly DavisConfig $config,
        private readonly ContactsService $contacts,
        private readonly CardRepository $cards,
        private readonly AddressBook $addressBook,
    ) {
    }

    /**
     * Every card in summary, in one go: the list filters them on the client.
     */
    #[Route('/cards', methods: ['GET'])]
    public function list(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        $owner = $this->owner($user);
        $this->contacts->warm($user);
        $books = $this->contacts->books($owner);
        $bookIds = array_column($books, 'id', 'href');

        $cards = [];
        foreach ($this->cards->findAllOwned($owner) as $card) {
            // A card of a book that is not listed any more is on its way out
            if (isset($bookIds[$card->getBook()])) {
                $cards[] = [
                    'id' => $card->getId(),
                    'book' => $bookIds[$card->getBook()],
                    'etag' => $card->getEtag(),
                    'name' => $card->getName(),
                    'org' => $card->getOrg(),
                    'emails' => $card->getEmails(),
                    'phones' => $card->getPhones(),
                    'photo' => $card->hasPhoto(),
                ];
            }
        }

        return new JsonResponse([
            'available' => $this->contacts->available($owner),
            'books' => array_map(static fn (array $b) => ['id' => $b['id'], 'name' => $b['name']], $books),
            'cards' => $cards,
        ]);
    }

    /**
     * Asks the server now rather than in a few minutes.
     */
    #[Route('/refresh', methods: ['POST'])]
    public function refresh(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        $owner = $this->owner($user);
        $changed = $this->contacts->refresh($user);

        return new JsonResponse(['available' => $this->contacts->available($owner), 'changed' => $changed]);
    }

    #[Route('/cards/{id}', methods: ['GET'], requirements: ['id' => self::ID])]
    public function show(#[CurrentUser] RemoteUser $user, string $id): JsonResponse
    {
        return new JsonResponse($this->model($this->card($user, $id)));
    }

    #[Route('/cards', methods: ['POST'])]
    public function create(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] CardInput $input): JsonResponse
    {
        $this->owner($user);
        if (null === $input->book) {
            throw new UnprocessableEntityHttpException('A new contact needs an address book');
        }

        return new JsonResponse($this->model($this->addressBook->create($user, $input->book, $input)), Response::HTTP_CREATED);
    }

    #[Route('/cards/{id}', methods: ['PUT'], requirements: ['id' => self::ID])]
    public function update(#[CurrentUser] RemoteUser $user, string $id, #[MapRequestPayload] CardInput $input): JsonResponse
    {
        $this->owner($user);

        return new JsonResponse($this->model($this->addressBook->update($user, $id, self::etag($input->etag), $input)));
    }

    /**
     * Answers with the card as it was, which the client can import again to undo.
     */
    #[Route('/cards/{id}', methods: ['DELETE'], requirements: ['id' => self::ID])]
    public function delete(#[CurrentUser] RemoteUser $user, string $id, #[MapQueryParameter] ?string $etag = null): JsonResponse
    {
        $this->owner($user);

        return new JsonResponse(['vcard' => $this->addressBook->delete($user, $id, self::etag($etag))]);
    }

    /**
     * A multipart form with the picture in "file" and the card's "etag".
     */
    #[Route('/cards/{id}/photo', methods: ['PUT'], requirements: ['id' => self::ID])]
    public function setPhoto(#[CurrentUser] RemoteUser $user, string $id, Request $request): JsonResponse
    {
        $this->owner($user);
        $etag = self::etag($request->request->getString('etag'));
        $bytes = self::upload($request, self::PHOTO_MAX_BYTES);
        try {
            $jpeg = Picture::jpeg($bytes);
        } catch (InvalidArgumentException $e) {
            throw new UnprocessableEntityHttpException($e->getMessage(), $e);
        }

        return new JsonResponse($this->model($this->addressBook->setPhoto($user, $id, $etag, $jpeg)));
    }

    /**
     * This card takes in what `other` has and it lacks, then `other` is deleted.
     * Both ETags are needed: the merge is made on the two cards the user looked at.
     */
    #[Route('/cards/{id}/merge', methods: ['POST'], requirements: ['id' => self::ID])]
    public function merge(#[CurrentUser] RemoteUser $user, string $id, Request $request): JsonResponse
    {
        $this->owner($user);
        $payload = $request->getPayload();
        $other = $payload->getString('other');
        if (1 !== preg_match('/^'.self::ID.'$/', $other) || $other === $id) {
            throw new UnprocessableEntityHttpException('Expected "other", the id of another card');
        }

        return new JsonResponse($this->model($this->addressBook->merge($user, $id, self::etag($payload->getString('etag')), $other, self::etag($payload->getString('otherEtag')))));
    }

    #[Route('/cards/{id}/photo', methods: ['DELETE'], requirements: ['id' => self::ID])]
    public function removePhoto(#[CurrentUser] RemoteUser $user, string $id, #[MapQueryParameter] ?string $etag = null): JsonResponse
    {
        $this->owner($user);

        return new JsonResponse($this->model($this->addressBook->removePhoto($user, $id, self::etag($etag))));
    }

    /**
     * A .vcf file in "file", each of its cards added as a new one.
     */
    #[Route('/books/{id}/import', methods: ['POST'], requirements: ['id' => self::ID])]
    public function import(#[CurrentUser] RemoteUser $user, string $id, Request $request): JsonResponse
    {
        $this->owner($user);

        return new JsonResponse($this->addressBook->import($user, $id, self::upload($request, AddressBook::IMPORT_MAX_BYTES)));
    }

    /**
     * The client asks for it with ?v=<etag>, so a changed picture has a new address.
     */
    #[Route('/cards/{id}/photo', methods: ['GET'], requirements: ['id' => self::ID])]
    public function photo(#[CurrentUser] RemoteUser $user, string $id): Response
    {
        $card = $this->card($user, $id);
        try {
            $photo = $card->hasPhoto() ? CardDocument::fromString($card->getVcard())->photo() : null;
        } catch (InvalidCard) {
            $photo = null;
        }
        if (null === $photo) {
            throw new NotFoundHttpException('No picture on this card');
        }

        return new Response($photo['data'], Response::HTTP_OK, [
            'Content-Type' => $photo['mime'],
            'Cache-Control' => 'private, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    #[Route('/cards/{id}/vcf', methods: ['GET'], requirements: ['id' => self::ID])]
    public function cardVcf(#[CurrentUser] RemoteUser $user, string $id): Response
    {
        $card = $this->card($user, $id);

        return self::vcf([$card], $card->getName() ?? 'contact');
    }

    /**
     * One book, as it is on the server a moment ago.
     */
    #[Route('/books/{id}/vcf', methods: ['GET'], requirements: ['id' => self::ID])]
    public function bookVcf(#[CurrentUser] RemoteUser $user, string $id): Response
    {
        $owner = $this->owner($user);
        $this->contacts->refresh($user);
        $book = $this->contacts->book($owner, $id) ?? throw new NotFoundHttpException('No such address book');

        return self::vcf($this->cards->findAllOwned($owner, $book['href']), $book['name']);
    }

    /**
     * Every book in one file.
     */
    #[Route('/vcf', methods: ['GET'])]
    public function allVcf(#[CurrentUser] RemoteUser $user): Response
    {
        $owner = $this->owner($user);
        $this->contacts->refresh($user);
        $hrefs = array_column($this->contacts->books($owner), 'href');

        return self::vcf(array_values(array_filter($this->cards->findAllOwned($owner), static fn (Card $c) => in_array($c->getBook(), $hrefs, true))), 'contacts');
    }

    /**
     * The card as the address book shows it. A card the app cannot read is
     * still shown, with what the cache knows of it.
     *
     * @return array<string, mixed>
     */
    private function model(Card $card): array
    {
        try {
            $model = CardDocument::fromString($card->getVcard())->toArray();
        } catch (InvalidCard) {
            $model = [
                'name' => $card->getName(), 'firstName' => null, 'lastName' => null, 'org' => $card->getOrg(), 'title' => null,
                'emails' => array_map(static fn (int $key, string $email) => ['key' => $key, 'value' => $email, 'type' => 'other', 'label' => null], array_keys($card->getEmails()), $card->getEmails()),
                'phones' => [], 'addresses' => [], 'urls' => [], 'birthday' => null, 'note' => null, 'photo' => false,
            ];
        }

        return ['id' => $card->getId(), 'book' => Card::idFor($card->getOwner(), $card->getBook()), 'etag' => $card->getEtag()] + $model;
    }

    private static function etag(?string $etag): string
    {
        if (!Etag::valid($etag)) {
            throw new UnprocessableEntityHttpException('Expected the "etag" the card was read with');
        }

        return (string) $etag;
    }

    private static function upload(Request $request, int $maxBytes): string
    {
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            throw new UnprocessableEntityHttpException('Expected a "file" field');
        }
        if ($file->getSize() > $maxBytes) {
            throw new HttpException(Response::HTTP_REQUEST_ENTITY_TOO_LARGE, 'file_too_large');
        }

        return $file->getContent();
    }

    private function card(RemoteUser $user, string $id): Card
    {
        return $this->cards->findOwned($this->owner($user), $id) ?? throw new NotFoundHttpException('contact_not_found');
    }

    private function owner(RemoteUser $user): string
    {
        if (!$this->config->enabled()) {
            throw new NotFoundHttpException('contacts_disabled');
        }

        return $user->getUserIdentifier();
    }

    /**
     * @param list<Card> $cards
     */
    private static function vcf(array $cards, string $name): Response
    {
        $body = implode('', array_map(static fn (Card $c) => rtrim($c->getVcard(), "\r\n")."\r\n", $cards));

        // No path, quote or control character from a contact's name reaches the header
        $filename = trim(preg_replace('/[\x00-\x1f\x7f\/\\\\"%]+/u', ' ', $name) ?? '') ?: 'contact';
        // Old browsers get the name without accents
        $plain = preg_replace('/\p{Mn}+/u', '', (string) Normalizer::normalize($filename, Normalizer::FORM_D)) ?? '';
        $fallback = trim(preg_replace('/[^A-Za-z0-9 ._-]+/', '_', $plain) ?? '') ?: 'contact';

        return new Response($body, Response::HTTP_OK, [
            'Content-Type' => 'text/vcard; charset=utf-8',
            'Content-Disposition' => HeaderUtils::makeDisposition(HeaderUtils::DISPOSITION_ATTACHMENT, $filename.'.vcf', $fallback.'.vcf'),
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
