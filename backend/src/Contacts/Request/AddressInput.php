<?php

declare(strict_types=1);

namespace App\Contacts\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class AddressInput
{
    public function __construct(
        #[Assert\Choice(choices: ['home', 'work', 'other'])]
        public string $type = 'other',
        #[Assert\Length(max: 500)]
        public string $street = '',
        #[Assert\Length(max: 200)]
        public string $city = '',
        #[Assert\Length(max: 200)]
        public string $region = '',
        #[Assert\Length(max: 50)]
        public string $postalCode = '',
        #[Assert\Length(max: 200)]
        public string $country = '',
        #[Assert\PositiveOrZero]
        public ?int $key = null,
    ) {
    }

    public function isEmpty(): bool
    {
        return '' === trim($this->street.$this->city.$this->region.$this->postalCode.$this->country);
    }
}
