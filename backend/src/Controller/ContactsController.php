<?php

declare(strict_types=1);

namespace App\Controller;

use App\Contacts\ContactsService;
use App\Entity\Contact;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

use function array_slice;

final class ContactsController
{
    /** Addresses per lookup: a page of the list, a conversation's recipients */
    private const int LOOKUP_MAX = 200;

    public function __construct(private readonly ContactsService $contacts)
    {
    }

    #[Route('/api/contacts', methods: ['GET'])]
    public function search(#[CurrentUser] RemoteUser $user, #[MapQueryParameter] string $q = ''): JsonResponse
    {
        return new JsonResponse(array_map(
            static fn (Contact $c) => ['name' => $c->getName(), 'email' => $c->getEmail()],
            $this->contacts->search($user, mb_substr($q, 0, 100)),
        ));
    }

    /**
     * Which of these addresses are in the user's address books, under what name, with a picture or not, and on which card:
     * `{"bob@example.test": {"name": "Bob Martin", "photo": true, "id": "…"}, "anon@example.test": {"name": null, "photo": false, "id": "…"}}`.
     *
     * @param array<mixed> $emails `?emails[]=a@x&emails[]=b@y`
     */
    #[Route('/api/contacts/lookup', methods: ['GET'])]
    public function lookup(#[CurrentUser] RemoteUser $user, #[MapQueryParameter] array $emails = []): JsonResponse
    {
        $emails = array_values(array_unique(array_filter(
            array_map(static fn (string $e): string => mb_substr(trim($e), 0, 320), array_filter(array_slice($emails, 0, self::LOOKUP_MAX), is_string(...))),
            static fn (string $e): bool => '' !== $e,
        )));

        return new JsonResponse((object) $this->contacts->lookup($user, $emails));
    }

    /**
     * The picture on the contact card of an address, for avatars.
     */
    #[Route('/api/contacts/photo', methods: ['GET'])]
    public function photo(#[CurrentUser] RemoteUser $user, #[MapQueryParameter] string $email = ''): Response
    {
        $photo = $this->contacts->photo($user, mb_substr(trim($email), 0, 320));
        if (null === $photo) {
            return new JsonResponse(['error' => 'No picture for this address'], Response::HTTP_NOT_FOUND);
        }

        $response = new Response($photo['data'], Response::HTTP_OK, [
            'Content-Type' => $photo['mime'],
            // The browser keeps it for a day; the ETag refreshes it sooner when the card changes
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $response->setEtag(md5($photo['data']));

        return $response;
    }
}
