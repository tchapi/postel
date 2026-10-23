<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserSettingsRepository;
use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * The few things a user can tune. One row per user, created on first save.
 */
#[ORM\Entity(repositoryClass: UserSettingsRepository::class)]
#[ORM\Table(name: 'user_settings')]
class UserSettings
{
    public const string DENSITY_COMFORTABLE = 'comfortable';
    public const string DENSITY_COMPACT = 'compact';

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

    public function getUpdatedAt(): DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function update(?string $fromName, ?string $signature, bool $loadRemoteImages, string $density): void
    {
        $this->fromName = null === $fromName || '' === trim($fromName) ? null : trim($fromName);
        $this->signature = null === $signature || '' === trim(strip_tags($signature)) ? null : $signature;
        $this->loadRemoteImages = $loadRemoteImages;
        $this->density = $density;
        $this->updatedAt = new DateTimeImmutable();
    }
}
