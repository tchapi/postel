<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserSettingsRepository;
use App\Settings\SettingsChange;
use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * What a user can tune. One row per user, created on first save.
 */
#[ORM\Entity(repositoryClass: UserSettingsRepository::class)]
#[ORM\Table(name: 'user_settings')]
class UserSettings
{
    public const string DENSITY_COMFORTABLE = 'comfortable';
    public const string DENSITY_COMPACT = 'compact';
    public const array DENSITIES = [self::DENSITY_COMFORTABLE, self::DENSITY_COMPACT];
    public const array LANGUAGES = ['en', 'fr'];
    public const array ACCENTS = ['iris', 'ocean', 'teal', 'sage', 'olive', 'amber', 'clay', 'rose', 'graphite'];

    #[ORM\Id]
    #[ORM\Column(length: 255)]
    private string $username;

    #[ORM\Column(length: 200, nullable: true)]
    private ?string $fromName = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $signature = null;

    #[ORM\Column]
    private bool $loadRemoteImages = false;

    #[ORM\Column(length: 20)]
    private string $density = self::DENSITY_COMFORTABLE;

    #[ORM\Column(options: ['default' => true])]
    private bool $threads = true;

    #[ORM\Column(length: 5, options: ['default' => 'en'])]
    private string $language = 'en';

    #[ORM\Column(length: 20, options: ['default' => 'iris'])]
    private string $accent = 'iris';

    /** @var list<string> */
    #[ORM\Column(type: Types::JSON, options: ['default' => '[]'])]
    private array $allowedSenders = [];

    #[ORM\Column]
    private DateTimeImmutable $updatedAt;

    public function __construct(string $username)
    {
        $this->username = $username;
        $this->updatedAt = new DateTimeImmutable();
    }

    public function getUsername(): string
    {
        return $this->username;
    }

    public function getFromName(): ?string
    {
        return $this->fromName;
    }

    public function getSignature(): ?string
    {
        return $this->signature;
    }

    public function loadsRemoteImages(): bool
    {
        return $this->loadRemoteImages;
    }

    public function getDensity(): string
    {
        return $this->density;
    }

    public function groupsThreads(): bool
    {
        return $this->threads;
    }

    public function getLanguage(): string
    {
        return $this->language;
    }

    public function getAccent(): string
    {
        return $this->accent;
    }

    /**
     * @return list<string>
     */
    public function getAllowedSenders(): array
    {
        return $this->allowedSenders;
    }

    public function getUpdatedAt(): DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * @param string|null $signature already sanitized
     */
    public function update(SettingsChange $change, ?string $signature): void
    {
        $this->fromName = null === $change->fromName || '' === trim($change->fromName) ? null : trim($change->fromName);
        $this->signature = null === $signature || '' === trim(strip_tags($signature)) ? null : $signature;
        $this->loadRemoteImages = $change->loadRemoteImages;
        $this->density = $change->density;
        $this->threads = $change->threads;
        $this->language = $change->language;
        $this->accent = $change->accent;
        $this->allowedSenders = array_values(array_unique(array_map('strtolower', $change->allowedSenders)));
        $this->updatedAt = new DateTimeImmutable();
    }
}
