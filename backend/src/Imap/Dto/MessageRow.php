<?php

declare(strict_types=1);

namespace App\Imap\Dto;

use DateTimeImmutable;

final readonly class MessageRow
{
    /**
     * @param list<int> $threadUids every message of the conversation in this folder, oldest first
     */
    public function __construct(
        public int $uid,
        public string $folder,
        public ?Address $from,
        public string $subject,
        public string $snippet,
        public ?DateTimeImmutable $date,
        public bool $seen,
        public bool $flagged,
        public bool $hasAttachments,
        public int $size,
        public int $threadSize = 1,
        public array $threadUids = [],
    ) {
    }
}
