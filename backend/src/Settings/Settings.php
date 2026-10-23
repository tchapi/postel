<?php

declare(strict_types=1);

namespace App\Settings;

use App\Entity\UserSettings;
use DateTimeImmutable;

use function in_array;

/**
 * What the API shows and accepts, defaults included.
 */
final readonly class Settings
{
    /**
     * @param list<string> $allowedSenders
     */
    public function __construct(
        public ?string $fromName,
        public ?string $signature,
        public bool $loadRemoteImages,
        public string $density,
        public bool $threads,
        public string $language,
        public string $accent,
        public array $allowedSenders,
        public ?DateTimeImmutable $updatedAt,
    ) {
    }

    public static function defaults(): self
    {
        return new self(null, null, false, UserSettings::DENSITY_COMFORTABLE, true, 'en', 'violet', [], null);
    }

    public static function fromEntity(UserSettings $entity): self
    {
        return new self(
            $entity->getFromName(),
            $entity->getSignature(),
            $entity->loadsRemoteImages(),
            $entity->getDensity(),
            $entity->groupsThreads(),
            $entity->getLanguage(),
            $entity->getAccent(),
            $entity->getAllowedSenders(),
            $entity->getUpdatedAt(),
        );
    }

    public function allowsRemoteImagesFrom(?string $email): bool
    {
        return $this->loadRemoteImages || (null !== $email && in_array(strtolower($email), $this->allowedSenders, true));
    }
}
