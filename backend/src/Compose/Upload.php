<?php

declare(strict_types=1);

namespace App\Compose;

final readonly class Upload
{
    public function __construct(
        public string $id,
        public string $name,
        public string $mime,
        public int $size,
    ) {
    }
}
