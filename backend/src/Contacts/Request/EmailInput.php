<?php

declare(strict_types=1);

namespace App\Contacts\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class EmailInput
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Length(max: 320)]
        #[Assert\Email(mode: Assert\Email::VALIDATION_MODE_HTML5)]
        public string $value,
        #[Assert\Choice(choices: ['home', 'work', 'other'])]
        public string $type = 'other',
        #[Assert\PositiveOrZero]
        public ?int $key = null,
    ) {
    }
}
