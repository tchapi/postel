<?php

declare(strict_types=1);

namespace App\Imap\Dto;

final readonly class PartContent
{
    public function __construct(
        public string $content,
        public string $mime,
        public ?string $filename,
    ) {
    }
}
