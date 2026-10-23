<?php

declare(strict_types=1);

namespace App\Compose\Request;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * What the composer sends, whether to save or to send.
 */
final readonly class Draft
{
    /**
     * @param list<Recipient> $to
     * @param list<Recipient> $cc
     * @param list<Recipient> $bcc
     * @param list<string>    $uploads ids returned by POST /api/uploads
     */
    public function __construct(
        #[Assert\Valid]
        public array $to = [],
        #[Assert\Valid]
        public array $cc = [],
        #[Assert\Valid]
        public array $bcc = [],
        #[Assert\Length(max: 1000)]
        public string $subject = '',
        public ?string $html = null,
        public ?string $text = null,
        #[Assert\All([new Assert\Regex('/^[a-f0-9]{32}$/')])]
        public array $uploads = [],
        #[Assert\Valid]
        public ?MessageRef $inReplyTo = null,
        #[Assert\Valid]
        public ?MessageRef $forwardOf = null,
        #[Assert\Valid]
        public ?MessageRef $attachmentsFrom = null,
        #[Assert\Valid]
        public ?MessageRef $replaces = null,
    ) {
    }

    /**
     * @return list<Recipient>
     */
    public function recipients(): array
    {
        return [...$this->to, ...$this->cc, ...$this->bcc];
    }
}
