<?php

declare(strict_types=1);

namespace App\Controller;

use App\Imap\FolderService;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Serializer\SerializerInterface;

final class FoldersController
{
    public function __construct(
        private readonly FolderService $folders,
        private readonly SerializerInterface $serializer,
    ) {
    }

    #[Route('/api/folders', methods: ['GET'])]
    public function __invoke(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return JsonResponse::fromJsonString($this->serializer->serialize($this->folders->list($user), 'json'));
    }
}
