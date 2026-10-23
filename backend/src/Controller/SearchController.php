<?php

declare(strict_types=1);

namespace App\Controller;

use App\Imap\MessageListService;
use App\Security\RemoteUser;
use DateTimeInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Serializer\SerializerInterface;

/**
 * Search across folders, Trash and Junk left out. Same filters as a folder listing.
 */
final class SearchController
{
    public function __construct(
        private readonly MessageListService $list,
        private readonly SerializerInterface $serializer,
    ) {
    }

    #[Route('/api/search', methods: ['GET'])]
    public function __invoke(#[CurrentUser] RemoteUser $user, Request $request): JsonResponse
    {
        $page = $this->list->searchAll(
            $user,
            $request->query->getInt('page', 1),
            $request->query->getInt('perPage', 50),
            MessagesController::criteria($request),
        );

        return JsonResponse::fromJsonString($this->serializer->serialize($page, 'json', ['datetime_format' => DateTimeInterface::RFC3339]));
    }
}
