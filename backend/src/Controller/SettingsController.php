<?php

declare(strict_types=1);

namespace App\Controller;

use App\Security\RemoteUser;
use App\Settings\Settings;
use App\Settings\SettingsChange;
use App\Settings\SettingsService;
use DateTimeInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/settings')]
final class SettingsController
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    #[Route('', methods: ['GET'])]
    public function get(#[CurrentUser] RemoteUser $user): JsonResponse
    {
        return $this->json($this->settings->get($user));
    }

    #[Route('', methods: ['PUT'])]
    public function update(#[CurrentUser] RemoteUser $user, #[MapRequestPayload] SettingsChange $change): JsonResponse
    {
        return $this->json($this->settings->update($user, $change));
    }

    private function json(Settings $settings): JsonResponse
    {
        return new JsonResponse([
            'fromName' => $settings->fromName,
            'signature' => $settings->signature,
            'loadRemoteImages' => $settings->loadRemoteImages,
            'density' => $settings->density,
            'threads' => $settings->threads,
            'language' => $settings->language,
            'accent' => $settings->accent,
            'allowedSenders' => $settings->allowedSenders,
            'updatedAt' => $settings->updatedAt?->format(DateTimeInterface::RFC3339),
        ]);
    }
}
