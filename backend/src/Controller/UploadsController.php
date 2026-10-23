<?php

declare(strict_types=1);

namespace App\Controller;

use App\Compose\UploadStore;
use App\Security\RemoteUser;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/uploads')]
final class UploadsController
{
    public function __construct(private readonly UploadStore $uploads)
    {
    }

    #[Route('', methods: ['POST'])]
    public function upload(#[CurrentUser] RemoteUser $user, Request $request): JsonResponse
    {
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            throw new BadRequestHttpException('Expected a "file" field');
        }

        return new JsonResponse($this->uploads->store($user, $file), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '[a-f0-9]{32}'])]
    public function delete(#[CurrentUser] RemoteUser $user, string $id): Response
    {
        $this->uploads->delete($user, $id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
