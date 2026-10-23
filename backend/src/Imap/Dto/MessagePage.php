<?php

declare(strict_types=1);

namespace App\Imap\Dto;

final readonly class MessagePage
{
    /**
     * @param list<MessageRow> $items
     */
    public function __construct(
        public array $items,
        public int $total,
        public int $page,
        public int $perPage,
    ) {
    }
}
