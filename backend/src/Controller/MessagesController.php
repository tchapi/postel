<?php

declare(strict_types=1);

namespace App\Controller;

use App\Imap\MessageListService;
use App\Imap\MessageService;
use App\Imap\SearchCriteria;
use App\Security\RemoteUser;
use App\Settings\SettingsService;
use DateTimeImmutable;
use DateTimeInterface;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Serializer\SerializerInterface;

use function function_exists;
use function sprintf;

#[Route('/api/folders/{folder}/messages', requirements: ['folder' => '[^/]+'])]
final class MessagesController
{
    /** Longest side in pixels: the chip shows 28px, this leaves room for 3x screens. */
    private const int THUMBNAIL_SIZE = 96;

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

        $search = self::criteria($request);
        $page = $request->query->getInt('page', 1);
        $perPage = $request->query->getInt('perPage', 50);

        if ($request->query->getBoolean('threads')) {
            return $this->json($this->list->threads($user, $folder, $page, $perPage, $search));
        }

        return $this->json($this->list->page($user, $folder, $page, $perPage, $sort, 'asc' !== $request->query->getString('order', 'desc'), $search));
    }

    #[Route('/{uid}/thread', methods: ['GET'], requirements: ['uid' => '\d+'])]
    public function thread(#[CurrentUser] RemoteUser $user, string $folder, int $uid): JsonResponse
    {
        return JsonResponse::fromJsonString($this->serializer->serialize($this->list->thread($user, $folder, $uid), 'json', ['datetime_format' => DateTimeInterface::RFC3339]));
    }

    #[Route('/{uid}', methods: ['GET'], requirements: ['uid' => '\d+'])]
    public function get(#[CurrentUser] RemoteUser $user, string $folder, int $uid, Request $request): JsonResponse
    {
        if ($request->query->has('images')) {
            return $this->json($this->messages->get($user, $folder, $uid, $request->query->getBoolean('images')));
        }

        // The sender is only known once the message is parsed, so the default may take a second pass.
        $settings = $this->settings->get($user);
        $message = $this->messages->get($user, $folder, $uid, $settings->loadRemoteImages);
        if (!$message->remoteImagesLoaded && $message->hasRemoteImages && $settings->allowsRemoteImagesFrom($message->from?->email)) {
            $message = $this->messages->get($user, $folder, $uid, true);
        }

        return $this->json($message);
    }

    /**
     * The source of a message: plain text to read, or a .eml file with ?download=1.
     */
    #[Route('/{uid}/raw', methods: ['GET'], requirements: ['uid' => '\d+'])]
    public function raw(#[CurrentUser] RemoteUser $user, string $folder, int $uid, Request $request): Response
    {
        $download = $request->query->getBoolean('download');
        $response = new Response($this->messages->raw($user, $folder, $uid), Response::HTTP_OK, [
            'Content-Type' => $download ? 'message/rfc822' : 'text/plain; charset=utf-8',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'Cache-Control' => 'private, max-age=3600',
        ]);
        if ($download) {
            $response->headers->set('Content-Disposition', HeaderUtils::makeDisposition(HeaderUtils::DISPOSITION_ATTACHMENT, sprintf('message-%d.eml', $uid)));
        }

        return $response;
    }

    /**
     * Served as a download unless ?inline=1 asks for an image or a PDF, the
     * two kinds a browser can show without running anything from the part.
     */
    #[Route('/{uid}/parts/{section}', methods: ['GET'], requirements: ['uid' => '\d+', 'section' => '\d+(\.\d+)*'])]
    public function part(#[CurrentUser] RemoteUser $user, string $folder, int $uid, string $section, Request $request): Response
    {
        $part = $this->messages->part($user, $folder, $uid, $section);
        if ($request->query->getBoolean('thumb')) {
            return $this->thumbnail($part->content);
        }

        // plenty of clients attach PDFs as application/octet-stream
        $pdf = str_starts_with($part->content, '%PDF-');
        $inline = $request->query->getBoolean('inline') && ($pdf || str_starts_with($part->mime, 'image/'));

        $response = new Response($part->content, Response::HTTP_OK, [
            'Content-Type' => $inline ? ($pdf ? 'application/pdf' : $part->mime) : 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=3600',
        ]);
        if (!$inline || !$pdf) {
            // NOTE: browsers refuse to start their PDF viewer in a sandboxed document
            $response->headers->set('Content-Security-Policy', "default-src 'none'; sandbox");
        }
        $response->headers->set('Content-Disposition', HeaderUtils::makeDisposition(
            $inline ? HeaderUtils::DISPOSITION_INLINE : HeaderUtils::DISPOSITION_ATTACHMENT,
            $part->filename ?? 'part-'.$section,
            'part-'.$section,
        ));

        return $response;
    }

    /**
     * A small JPEG of an image part, 404 for anything GD cannot or should not open.
     */
    private function thumbnail(string $bytes): Response
    {
        $size = function_exists('imagecreatefromstring') ? @getimagesizefromstring($bytes) : false;
        // decoding takes ~5 bytes per pixel, so no more than 24 MP under our 256M memory_limit
        if (false === $size || $size[0] * $size[1] > 24_000_000) {
            throw new NotFoundHttpException('No thumbnail');
        }
        $image = @imagecreatefromstring($bytes);
        if (false === $image) {
            throw new NotFoundHttpException('No thumbnail');
        }

        $scale = min(1, self::THUMBNAIL_SIZE / max($size[0], $size[1]));
        $width = max(1, (int) round($size[0] * $scale));
        $height = max(1, (int) round($size[1] * $scale));
        $thumb = imagecreatetruecolor($width, $height);
        if (false === $thumb) {
            throw new NotFoundHttpException('No thumbnail');
        }
        // transparent PNGs would come out black otherwise
        imagefill($thumb, 0, 0, (int) imagecolorallocate($thumb, 255, 255, 255));
        imagecopyresampled($thumb, $image, 0, 0, 0, 0, $width, $height, $size[0], $size[1]);

        ob_start();
        imagejpeg($thumb, null, 80);

        return new Response((string) ob_get_clean(), Response::HTTP_OK, [
            'Content-Type' => 'image/jpeg',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'Cache-Control' => 'private, max-age=86400, immutable',
        ]);
    }

    /**
     * q, unread, flagged, attachments, since and before (YYYY-MM-DD) into IMAP search keys.
     */
    public static function criteria(Request $request): string
    {
        $date = static function (string $name) use ($request): ?DateTimeImmutable {
            $value = $request->query->getString($name);
            if ('' === $value) {
                return null;
            }
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (false === $date) {
                throw new BadRequestHttpException(sprintf('"%s" must be a YYYY-MM-DD date', $name));
            }

            return $date;
        };

        return SearchCriteria::build(
            $request->query->getString('q'),
            $request->query->getBoolean('unread'),
            $request->query->getBoolean('flagged'),
            $request->query->getBoolean('attachments'),
            $date('since'),
            $date('before'),
        );
    }

    private function json(object $payload): JsonResponse
    {
        return JsonResponse::fromJsonString($this->serializer->serialize($payload, 'json', ['datetime_format' => DateTimeInterface::RFC3339]));
    }
}
