<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ContactSyncRepository;
use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Where a user's contacts cache stands against Davis.
 */
#[ORM\Entity(repositoryClass: ContactSyncRepository::class)]
#[ORM\Table(name: 'contact_sync')]
class ContactSync
{
    #[ORM\Column(length: 500, nullable: true)]
    private ?string $home = null;

    /** @var array<string, string> sync token by address book href */
    #[ORM\Column(type: Types::JSON)]
    private array $books = [];

    #[ORM\Column(nullable: true)]
    private ?DateTimeImmutable $checkedAt = null;

    public function __construct(
        #[ORM\Id]
        #[ORM\Column(length: 255)]
        private string $owner,
    ) {
    }

    public function getHome(): ?string
    {
        return $this->home;
    }

    public function setHome(?string $home): void
    {
        $this->home = $home;
    }

    /**
     * @return array<string, string>
     */
    public function getBooks(): array
    {
        return $this->books;
    }

    /**
     * @param array<string, string> $books
     */
    public function setBooks(array $books): void
    {
        $this->books = $books;
    }

    public function getCheckedAt(): ?DateTimeImmutable
    {
        return $this->checkedAt;
    }

    public function checked(DateTimeImmutable $at): void
    {
        $this->checkedAt = $at;
    }
}
