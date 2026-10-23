<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ContactRepository;
use Doctrine\ORM\Mapping as ORM;
use Normalizer;

/**
 * One address of a Davis contact, cached for autocomplete.
 */
#[ORM\Entity(repositoryClass: ContactRepository::class)]
#[ORM\Table(name: 'contact')]
#[ORM\Index(name: 'contact_owner', columns: ['owner'])]
class Contact
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** Name and address folded for matching: "Émile" is found as "emile". */
    #[ORM\Column(length: 600)]
    private string $search;

    public function __construct(
        #[ORM\Column(length: 255)]
        private string $owner,
        /** The address book it came from, to replace one book at a time */
        #[ORM\Column(length: 500)]
        private string $book,
        #[ORM\Column(length: 255, nullable: true)]
        private ?string $name,
        #[ORM\Column(length: 320)]
        private string $email,
    ) {
        $this->search = self::fold(($name ?? '').' '.$email);
    }

    public static function fold(string $text): string
    {
        $decomposed = Normalizer::normalize($text, Normalizer::FORM_D);

        return mb_strtolower(preg_replace('/\p{Mn}+/u', '', false === $decomposed ? $text : $decomposed) ?? $text);
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }
}
