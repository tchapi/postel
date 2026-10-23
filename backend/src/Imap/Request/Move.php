<?php

declare(strict_types=1);

namespace App\Imap\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class Move
{
    /**
     * @param list<int> $uids
     */
    public function __construct(
        #[Assert\NotBlank]
        public string $folder,
        #[Assert\Count(min: 1, max: 500)]
        #[Assert\All([new Assert\Type('int'), new Assert\Positive()])]
        public array $uids,
        #[Assert\NotBlank]
        public string $to,
    ) {
    }
}
