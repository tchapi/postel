<?php

declare(strict_types=1);

namespace App\Contacts\Request;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * A contact as the editor sends it. Rows of emails, phones, addresses and
 * links carry the `key` they were read with, so they are updated in place;
 * a row without one is new, and a key that is not sent back is removed.
 *
 * `book` is only read when creating, `etag` only when updating.
 */
final readonly class CardInput
{
    /**
     * @param list<EmailInput>   $emails
     * @param list<PhoneInput>   $phones
     * @param list<AddressInput> $addresses
     * @param list<UrlInput>     $urls
     */
    public function __construct(
        #[Assert\Length(max: 200)]
        public ?string $firstName = null,
        #[Assert\Length(max: 200)]
        public ?string $lastName = null,
        #[Assert\Length(max: 200)]
        public ?string $org = null,
        #[Assert\Length(max: 200)]
        public ?string $title = null,
        #[Assert\Valid]
        #[Assert\Count(max: 50)]
        public array $emails = [],
        #[Assert\Valid]
        #[Assert\Count(max: 50)]
        public array $phones = [],
        #[Assert\Valid]
        #[Assert\Count(max: 20)]
        public array $addresses = [],
        #[Assert\Valid]
        #[Assert\Count(max: 20)]
        public array $urls = [],
        /** "1984-03-12", or "--03-12" without a year */
        #[Assert\Regex('/^(\d{4}|-)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/')]
        public ?string $birthday = null,
        #[Assert\Length(max: 10000)]
        public ?string $note = null,
        /** The book a new card goes to */
        #[Assert\Regex('/^[a-f0-9]{32}$/')]
        public ?string $book = null,
        /** The version of the card the edit was made on */
        #[Assert\Regex(Etag::PATTERN)]
        public ?string $etag = null,
    ) {
    }

    /**
     * A card needs something to be called by.
     *
     * @psalm-suppress PossiblyUnusedMethod called by the validator
     */
    #[Assert\IsTrue(message: 'A contact needs a first name, a last name, an organisation or an email address.')]
    public function hasName(): bool
    {
        foreach ([$this->firstName, $this->lastName, $this->org] as $text) {
            if ('' !== trim($text ?? '')) {
                return true;
            }
        }

        return [] !== $this->emails;
    }
}
