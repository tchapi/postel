<?php

declare(strict_types=1);

namespace App\Compose\Request;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * Points at a message in a folder: the one being answered, forwarded or
 * whose attachments are carried over.
 *
 * @param list<string>|null $sections attachment sections to carry over, all of them when null
 */
final readonly class MessageRef
{
    /**
     * @param list<string>|null $sections
     */
    public function __construct(
        #[Assert\NotBlank]
        public string $folder,
        #[Assert\Positive]
        public int $uid,
        #[Assert\All([new Assert\Regex('/^\d+(\.\d+)*$/')])]
        public ?array $sections = null,
    ) {
    }
}
