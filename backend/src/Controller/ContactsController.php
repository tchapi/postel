<?php

declare(strict_types=1);

namespace App\Controller;

use App\Contacts\ContactsService;
use App\Entity\Contact;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class ContactsController
{
    public function __construct(private readonly ContactsService $contacts)
    {
    }

    #[Route('/api/contacts', methods: ['GET'])]
    public function __invoke(#[CurrentUser] RemoteUser $user, #[MapQueryParameter] string $q = ''): JsonResponse
    {
        return new JsonResponse(array_map(
            static fn (Contact $c) => ['name' => $c->getName(), 'email' => $c->getEmail()],
            $this->contacts->search($user, mb_substr($q, 0, 100)),
        ));
    }
}
