<?php

declare(strict_types=1);

namespace App\Settings;

use App\Entity\UserSettings;
use DateTimeImmutable;

/**
 * What the API shows and accepts, defaults included.
 */
final readonly class Settings
{
    public function __construct(
        public ?string $fromName,
        public ?string $signature,
        public bool $loadRemoteImages,
        public string $density,
        public ?DateTimeImmutable $updatedAt,
    ) {
    }

    public static function defaults(): self
    {
        return new self(null, null, false, UserSettings::DENSITY_COMFORTABLE, null);
    }

    public static function fromEntity(UserSettings $entity): self
    {
        return new self($entity->getFromName(), $entity->getSignature(), $entity->loadsRemoteImages(), $entity->getDensity(), $entity->getUpdatedAt());
    }
}
