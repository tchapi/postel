<?php

declare(strict_types=1);

namespace App\Controller;

use App\Imap\MessageActionService;
use App\Imap\Request\FlagsChange;
use App\Imap\Request\Move;
use App\Imap\Request\Selection;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Bulk actions on messages. Archive, junk and trash are moves to the folder
 * with that role, the frontend knows which one.
 */
#[Route('/api/messages')]
final class MessageActionsController
{
    public function __construct(private readonly MessageActionService $actions)
    {
    }

    #[Route('/flags', methods: ['PATCH'])]
    public function flags(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] FlagsChange $change): Response
    {
        $this->actions->flag($user, $change->folder, $change->uids, $change->seen, $change->flagged);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/move', methods: ['POST'])]
    public function move(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] Move $move): JsonResponse
    {
        return new JsonResponse(['uids' => $this->actions->move($user, $move->folder, $move->uids, $move->to)]);
    }

    #[Route('/delete', methods: ['POST'])]
    public function delete(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] Selection $selection): Response
    {
        $this->actions->delete($user, $selection->folder, $selection->uids);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
