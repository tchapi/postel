<?php

declare(strict_types=1);

namespace App\Imap\Dto;

final readonly class Attachment
{
    public function __construct(
        public string $id,
        public string $name,
        public int $size,
        public string $mime,
        public bool $inline,
    ) {
    }
}
