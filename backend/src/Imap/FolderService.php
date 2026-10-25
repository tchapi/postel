<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Dto\Folder;
use App\Imap\Exception\ImapCommandFailed;
use App\Security\RemoteUser;

use function array_slice;
use function count;
use function in_array;
use function is_array;
use function is_string;

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
                    'name' => MailboxName::decode(end($segments)),
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
     * The archive folder, created on first use: archiving must not depend on
     * the account already having one. It goes next to the other well-known
     * folders (so under "INBOX." on servers that keep everything there), and
     * carries the \Archive attribute when the server lets us set it.
     */
    public function archive(RemoteUser $user): string
    {
        return $this->findByRole($user, FolderRole::Archive) ?? Mailbox::session($this->clients, $user, static function (Mailbox $mailbox): string {
            $parent = null;
            $delimiter = '';
            foreach ($mailbox->command('LIST', '"" "*"')->tokenized('LIST') as $row) {
                $flags = is_array($row[2] ?? null) ? array_values(array_filter($row[2], 'is_string')) : [];
                $path = $row[4] ?? null;
                if (!is_string($path) || !in_array(FolderRole::detect($path, $flags), [FolderRole::Sent, FolderRole::Trash, FolderRole::Drafts, FolderRole::Junk], true)) {
                    continue;
                }
                $delimiter = is_string($row[3] ?? null) ? $row[3] : '';
                $position = '' === $delimiter ? false : strrpos($path, $delimiter);
                $parent = false === $position ? null : substr($path, 0, $position);
                break;
            }
            $path = null === $parent ? 'Archive' : $parent.$delimiter.'Archive';

            $specialUse = array_any($mailbox->command('CAPABILITY')->untagged, static fn (string $line): bool => str_contains(strtoupper($line), 'CREATE-SPECIAL-USE'));
            try {
                $mailbox->command('CREATE', Mailbox::quote($path).($specialUse ? ' (USE (\Archive))' : ''));
            } catch (ImapCommandFailed $e) {
                if (!str_contains(strtoupper($e->text), 'ALREADYEXISTS') && !str_contains(strtolower($e->text), 'already exists')) {
                    throw $e;
                }
            }
            try {
                $mailbox->command('SUBSCRIBE', Mailbox::quote($path));
            } catch (ImapCommandFailed) {
                // Unsubscribed still works for us, other clients may just not show it
            }

            return $path;
        });
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
