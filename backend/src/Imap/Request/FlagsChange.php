<?php

declare(strict_types=1);

namespace App\Imap\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class FlagsChange
{
    /**
     * @param list<int> $uids
     */
    public function __construct(
        #[Assert\NotBlank]
        public string $folder,
        #[Assert\Count(min: 1, max: 10000)]
        #[Assert\All([new Assert\Type('int'), new Assert\Positive()])]
        public array $uids,
        public ?bool $seen = null,
        public ?bool $flagged = null,
    ) {
    }
}
