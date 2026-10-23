<?php

declare(strict_types=1);

namespace App\Settings;

use App\Entity\UserSettings;
use App\Repository\UserSettingsRepository;
use App\Security\RemoteUser;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerInterface;

final class SettingsService
{
    public function __construct(
        private readonly UserSettingsRepository $repository,
        private readonly EntityManagerInterface $entityManager,
        private readonly HtmlSanitizerInterface $mail,
    ) {
    }

    public function get(RemoteUser $user): Settings
    {
        $entity = $this->repository->find($user->username);

        return null === $entity ? Settings::defaults() : Settings::fromEntity($entity);
    }

    public function update(RemoteUser $user, SettingsChange $change): Settings
    {
        $entity = $this->repository->find($user->username) ?? new UserSettings($user->username);
        // The signature ends up in outgoing mail and in the composer, same rules as a received message.
        $signature = null === $change->signature ? null : $this->mail->sanitizeFor('body', $change->signature);
        $entity->update($change->fromName, $signature, $change->loadRemoteImages, $change->density);

        $this->entityManager->persist($entity);
        $this->entityManager->flush();

        return Settings::fromEntity($entity);
    }
}
