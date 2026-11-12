<?php

declare(strict_types=1);

namespace App\Contacts\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class PhoneInput
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Length(max: 100)]
        public string $value,
        #[Assert\Choice(choices: ['home', 'work', 'cell', 'other'])]
        public string $type = 'other',
        #[Assert\PositiveOrZero]
        public ?int $key = null,
    ) {
    }
}
