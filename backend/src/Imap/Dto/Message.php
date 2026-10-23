<?php

declare(strict_types=1);

namespace App\Imap\Dto;

use DateTimeImmutable;

final readonly class Message
{
    /**
     * @param list<Address>    $to
     * @param list<Address>    $cc
     * @param list<Address>    $bcc
     * @param list<Address>    $replyTo
     * @param list<Attachment> $attachments
     */
    public function __construct(
        public int $uid,
        public string $folder,
        public ?Address $from,
        public array $to,
        public array $cc,
        public array $bcc,
        public array $replyTo,
        public string $subject,
        public ?DateTimeImmutable $date,
        public bool $seen,
        public bool $flagged,
        public bool $answered,
        public bool $draft,
        public int $size,
        public ?string $messageId,
        public ?string $html,
        public ?string $text,
        public bool $hasRemoteImages,
        public bool $remoteImagesLoaded,
        public array $attachments,
    ) {
    }
}
