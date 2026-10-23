<?php

declare(strict_types=1);

namespace App\Controller;

use App\Imap\MessageListService;
use App\Imap\MessageService;
use App\Imap\SearchCriteria;
use App\Security\RemoteUser;
use App\Settings\SettingsService;
use DateTimeInterface;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Serializer\SerializerInterface;

#[Route('/api/folders/{folder}/messages', requirements: ['folder' => '[^/]+'])]
final class MessagesController
{
    public function __construct(
        private readonly MessageListService $list,
        private readonly MessageService $messages,
        private readonly SettingsService $settings,
        private readonly SerializerInterface $serializer,
    ) {
    }

    #[Route('', methods: ['GET'])]
    public function list(#[CurrentUser] RemoteUser $user, string $folder, Request $request): JsonResponse
    {
        $sort = $request->query->getString('sort', 'date');
        if (!MessageListService::isSort($sort)) {
            throw new BadRequestHttpException('Unknown sort');
        }

        $page = $this->list->page(
            $user,
            $folder,
            $request->query->getInt('page', 1),
            $request->query->getInt('perPage', 50),
            $sort,
            'asc' !== $request->query->getString('order', 'desc'),
            SearchCriteria::build(
                $request->query->getString('q'),
                $request->query->getBoolean('unread'),
                $request->query->getBoolean('flagged'),
            ),
        );

        return $this->json($page);
    }

    #[Route('/{uid}', methods: ['GET'], requirements: ['uid' => '\d+'])]
    public function get(#[CurrentUser] RemoteUser $user, string $folder, int $uid, Request $request): JsonResponse
    {
        $images = $request->query->has('images')
            ? $request->query->getBoolean('images')
            : $this->settings->get($user)->loadRemoteImages;

        return $this->json($this->messages->get($user, $folder, $uid, $images));
    }

    /**
     * Served as a download, never rendered in place: a part is untrusted bytes.
     */
    #[Route('/{uid}/parts/{section}', methods: ['GET'], requirements: ['uid' => '\d+', 'section' => '\d+(\.\d+)*'])]
    public function part(#[CurrentUser] RemoteUser $user, string $folder, int $uid, string $section, Request $request): Response
    {
        $part = $this->messages->part($user, $folder, $uid, $section);
        $inline = $request->query->getBoolean('inline') && str_starts_with($part->mime, 'image/');

        $response = new Response($part->content, Response::HTTP_OK, [
            'Content-Type' => $inline ? $part->mime : 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'Cache-Control' => 'private, max-age=3600',
        ]);
        $response->headers->set('Content-Disposition', HeaderUtils::makeDisposition(
            $inline ? HeaderUtils::DISPOSITION_INLINE : HeaderUtils::DISPOSITION_ATTACHMENT,
            $part->filename ?? 'part-'.$section,
            'part-'.$section,
        ));

        return $response;
    }

    private function json(object $payload): JsonResponse
    {
        return JsonResponse::fromJsonString($this->serializer->serialize($payload, 'json', ['datetime_format' => DateTimeInterface::RFC3339]));
    }
}
