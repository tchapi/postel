<?php

declare(strict_types=1);

namespace App\Imap\Dto;

final readonly class Address
{
    public function __construct(
        public string $email,
        public ?string $name = null,
    ) {
    }
}
