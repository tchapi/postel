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
    public function list(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return JsonResponse::fromJsonString($this->serializer->serialize($this->folders->list($user), 'json'));
    }

    /**
     * The archive folder's path, created if the account has none yet.
     */
    #[Route('/api/folders/archive', methods: ['POST'])]
    public function archive(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return new JsonResponse(['id' => $this->folders->archive($user)]);
    }
}
