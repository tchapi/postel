<?php

declare(strict_types=1);

namespace App\Imap\Dto;

use App\Imap\FolderRole;

final readonly class Folder
{
    /**
     * @param list<Folder> $children
     */
    public function __construct(
        public string $id,
        public string $name,
        public ?FolderRole $role,
        public int $unread,
        public int $total,
        public array $children = [],
    ) {
    }
}
