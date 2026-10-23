<?php

declare(strict_types=1);

namespace App\Controller;

use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class MeController
{
    #[Route('/api/me', methods: ['GET'])]
    public function __invoke(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return new JsonResponse([
            'username' => $user->username,
            'email' => $user->email,
            'displayName' => $user->displayName,
        ]);
    }
}
