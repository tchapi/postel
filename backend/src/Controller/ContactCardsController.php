<?php

declare(strict_types=1);

namespace App\Controller;

use App\Contacts\CardDocument;
use App\Contacts\ContactsService;
use App\Contacts\DavisConfig;
use App\Contacts\InvalidCard;
use App\Entity\Card;
use App\Repository\CardRepository;
use App\Security\RemoteUser;
use Normalizer;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

use function in_array;

/**
 * The address book: its cards from the cache, read and downloaded. Every
 * card is looked up by id and owner, so another user's id is not found.
 */
#[Route('/api/contacts')]
final class ContactCardsController
{
    private const string ID = '[a-f0-9]{32}';

    public function __construct(
        private readonly DavisConfig $config,
        private readonly ContactsService $contacts,
        private readonly CardRepository $cards,
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
