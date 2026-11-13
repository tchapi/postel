<?php

declare(strict_types=1);

namespace App\Controller;

use App\Contacts\DavisConfig;
use App\Security\RemoteUser;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class MeController
{
    public function __construct(
        #[Autowire(env: 'LOGOUT_URL')]
        private readonly string $logoutUrl,
        private readonly DavisConfig $davis,
    ) {
    }

    #[Route('/api/me', methods: ['GET'])]
    public function __invoke(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return new JsonResponse([
            'username' => $user->username,
            'email' => $user->email,
            'displayName' => $user->displayName,
            'logoutUrl' => '' === $this->logoutUrl ? null : $this->logoutUrl,
            // The address book shows only when there is one to show
            'contacts' => $this->davis->enabled(),
        ]);
    }
}
