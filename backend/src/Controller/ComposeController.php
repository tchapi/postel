<?php

declare(strict_types=1);

namespace App\Controller;

use App\Compose\DraftStore;
use App\Compose\Request\Draft;
use App\Compose\Sender;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class ComposeController
{
    public function __construct(
        private readonly Sender $sender,
        private readonly DraftStore $drafts,
    ) {
    }

    #[Route('/api/send', methods: ['POST'])]
    public function send(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] Draft $draft): Response
    {
        if ([] === $draft->recipients()) {
            throw new UnprocessableEntityHttpException('No recipient');
        }
        $this->sender->send($user, $draft);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/api/drafts', methods: ['PUT'])]
    public function save(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] Draft $draft): JsonResponse
    {
        return new JsonResponse($this->drafts->save($user, $draft));
    }
}
