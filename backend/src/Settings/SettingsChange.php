<?php

declare(strict_types=1);

namespace App\Settings;

use App\Entity\UserSettings;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class SettingsChange
{
    /**
     * @param list<string> $allowedSenders senders whose remote images always load
     */
    public function __construct(
        #[Assert\Length(max: 200)]
        public ?string $fromName = null,
        #[Assert\Length(max: 20000)]
        public ?string $signature = null,
        public bool $loadRemoteImages = false,
        #[Assert\Choice(choices: UserSettings::DENSITIES)]
        public string $density = UserSettings::DENSITY_COMFORTABLE,
        public bool $threads = true,
        #[Assert\Choice(choices: UserSettings::LANGUAGES)]
        public string $language = 'en',
        #[Assert\Choice(choices: UserSettings::ACCENTS)]
        public string $accent = 'violet',
        #[Assert\Count(max: 1000)]
        #[Assert\All([new Assert\Email(mode: Assert\Email::VALIDATION_MODE_HTML5)])]
        public array $allowedSenders = [],
    ) {
    }
}
