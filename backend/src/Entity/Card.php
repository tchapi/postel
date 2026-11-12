<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\CardRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * One contact card as the address book server has it, kept whole so the
 * address book can be browsed without asking the server.
 */
#[ORM\Entity(repositoryClass: CardRepository::class)]
#[ORM\Table(name: 'contact_card')]
#[ORM\Index(name: 'contact_card_owner', columns: ['owner'])]
#[ORM\Index(name: 'contact_card_owner_book', columns: ['owner', 'book'])]
class Card
{
    #[ORM\Id]
    #[ORM\Column(length: 32)]
    private string $id;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $name = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $org = null;

    /** @var list<string> */
    #[ORM\Column(type: Types::JSON)]
    private array $emails = [];

    /** @var list<string> */
    #[ORM\Column(type: Types::JSON)]
    private array $phones = [];

    /** The name folded, so the list sorts "Émile" with the E */
    #[ORM\Column(length: 255)]
    private string $sort = '';

    #[ORM\Column]
    private bool $hasPhoto = false;

    public function __construct(
        #[ORM\Column(length: 255)]
        private string $owner,
        #[ORM\Column(length: 500)]
        private string $book,
        #[ORM\Column(length: 500)]
        private string $href,
        #[ORM\Column(length: 255)]
        private string $etag,
        #[ORM\Column(type: Types::TEXT)]
        private string $vcard,
    ) {
        $this->id = self::idFor($owner, $href);
    }

    /**
     * Ids are derived from the href, so they stay the same across refreshes
     * and say nothing about the server.
     */
    public static function idFor(string $owner, string $href): string
    {
        return substr(hash('sha256', $owner."\n".$href), 0, 32);
    }

    /**
     * @param list<string> $emails
     * @param list<string> $phones
     */
    public function describe(?string $name, ?string $org, array $emails, array $phones, bool $hasPhoto): void
    {
        $this->name = null === $name ? null : mb_substr($name, 0, 255);
        $this->org = null === $org ? null : mb_substr($org, 0, 255);
        $this->emails = $emails;
        $this->phones = $phones;
        $this->sort = mb_substr(Contact::fold($name ?? ''), 0, 255);
        $this->hasPhoto = $hasPhoto;
    }

    public function replace(string $etag, string $vcard): void
    {
        $this->etag = $etag;
        $this->vcard = $vcard;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getOwner(): string
    {
        return $this->owner;
    }

    public function getBook(): string
    {
        return $this->book;
    }

    public function getHref(): string
    {
        return $this->href;
    }

    public function getEtag(): string
    {
        return $this->etag;
    }

    public function getVcard(): string
    {
        return $this->vcard;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function getOrg(): ?string
    {
        return $this->org;
    }

    /**
     * @return list<string>
     */
    public function getEmails(): array
    {
        return $this->emails;
    }

    /**
     * @return list<string>
     */
    public function getPhones(): array
    {
        return $this->phones;
    }

    public function hasPhoto(): bool
    {
        return $this->hasPhoto;
    }
}
