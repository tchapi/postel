<?php

declare(strict_types=1);

namespace App\Compose\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class Recipient
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Email(mode: Assert\Email::VALIDATION_MODE_HTML5)]
        public string $email,
        #[Assert\Length(max: 200)]
        public ?string $name = null,
    ) {
    }
}
