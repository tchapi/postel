<?php

declare(strict_types=1);

namespace App\Settings;

use App\Entity\UserSettings;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class SettingsChange
{
    public function __construct(
        #[Assert\Length(max: 200)]
        public ?string $fromName = null,
        #[Assert\Length(max: 20000)]
        public ?string $signature = null,
        public bool $loadRemoteImages = false,
        #[Assert\Choice(choices: [UserSettings::DENSITY_COMFORTABLE, UserSettings::DENSITY_COMPACT])]
        public string $density = UserSettings::DENSITY_COMFORTABLE,
    ) {
    }
}
