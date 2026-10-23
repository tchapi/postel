<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Dto\Folder;
use App\Security\RemoteUser;

use function array_slice;
use function count;
use function in_array;

final class FolderService
{
    public function __construct(private readonly ImapClientFactory $clients)
    {
    }

    /**
     * @return list<Folder>
     */
    public function list(RemoteUser $user): array
    {
        $client = $this->clients->forUser($user);
        $client->connect();

        try {
            $connection = $client->getConnection();

            // One flat LIST then one STATUS per selectable mailbox. The tree is
            // rebuilt from the delimiter, which keeps the round trips to N+1.
            /** @var array<string, array{delimiter: string, flags: list<string>}> $listed */
            $listed = $connection->folders('', '*')->validatedData();

            $nodes = [];
            foreach ($listed as $path => $item) {
                $selectable = !in_array('\NoSelect', $item['flags'], true) && !in_array('\Noselect', $item['flags'], true);
                $status = $selectable ? $connection->folderStatus($path, ['MESSAGES', 'UNSEEN'])->validatedData() : [];

                $segments = '' === $item['delimiter'] ? [$path] : explode($item['delimiter'], $path);

                $nodes[$path] = [
                    'parent' => count($segments) > 1 ? implode($item['delimiter'], array_slice($segments, 0, -1)) : null,
                    'name' => end($segments),
                    'role' => FolderRole::detect($path, $item['flags']),
                    'unread' => (int) ($status['unseen'] ?? 0),
                    'total' => (int) ($status['messages'] ?? 0),
                ];
            }
        } finally {
            $client->disconnect();
        }

        return $this->tree($nodes, null);
    }

    /**
     * The path of the folder with that role, from LIST alone.
     */
    public function findByRole(RemoteUser $user, FolderRole $role): ?string
    {
        $client = $this->clients->forUser($user);
        $client->connect();

        try {
            /** @var array<string, array{delimiter: string, flags: list<string>}> $listed */
            $listed = $client->getConnection()->folders('', '*')->validatedData();
        } finally {
            $client->disconnect();
        }

        foreach ($listed as $path => $item) {
            if (FolderRole::detect($path, $item['flags']) === $role) {
                return $path;
            }
        }

        return null;
    }

    /**
     * @param array<string, array{parent: ?string, name: string, role: ?FolderRole, unread: int, total: int}> $nodes
     *
     * @return list<Folder>
     */
    private function tree(array $nodes, ?string $parent): array
    {
        $folders = [];
        foreach ($nodes as $path => $node) {
            if ($node['parent'] !== $parent) {
                continue;
            }

            $folders[] = new Folder(
                id: $path,
                name: $node['name'],
                role: $node['role'],
                unread: $node['unread'],
                total: $node['total'],
                children: $this->tree($nodes, $path),
            );
        }

        usort($folders, self::compare(...));

        return $folders;
    }

    /**
     * Inbox first, then the well-known mailboxes, then the rest alphabetically.
     */
    private static function compare(Folder $a, Folder $b): int
    {
        $rank = static fn (Folder $folder): int => match ($folder->role) {
            FolderRole::Inbox => 0,
            FolderRole::Drafts => 1,
            FolderRole::Sent => 2,
            FolderRole::Archive => 3,
            FolderRole::Junk => 4,
            FolderRole::Trash => 5,
            null => 10,
        };

        return [$rank($a), strcasecmp($a->name, $b->name)] <=> [$rank($b), strcasecmp($a->name, $b->name)];
    }
}
