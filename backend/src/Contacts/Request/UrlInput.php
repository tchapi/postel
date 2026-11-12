<?php

declare(strict_types=1);

namespace App\Contacts\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class UrlInput
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Length(max: 2000)]
        public string $value,
        #[Assert\PositiveOrZero]
        public ?int $key = null,
    ) {
    }
}
