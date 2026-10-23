<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Exception\ImapCommandFailed;
use App\Security\RemoteUser;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

use function sprintf;

final class MessageActionService
{
    public function __construct(private readonly ImapClientFactory $clients)
    {
    }

    /**
     * @param list<int> $uids
     */
    public function flag(RemoteUser $user, string $folder, array $uids, ?bool $seen, ?bool $flagged): void
    {
        $changes = [];
        if (null !== $seen) {
            $changes[$seen ? '+' : '-'][] = '\Seen';
        }
        if (null !== $flagged) {
            $changes[$flagged ? '+' : '-'][] = '\Flagged';
        }
        if ([] === $changes) {
            return;
        }

        Mailbox::open($this->clients, $user, $folder, false, static function (Mailbox $mailbox) use ($uids, $changes): void {
            foreach ($changes as $sign => $flags) {
                $mailbox->command('UID STORE', sprintf('%s %sFLAGS.SILENT (%s)', Mailbox::set($uids), $sign, implode(' ', $flags)));
            }
        });
    }

    /**
     * @param list<int> $uids
     *
     * @return list<int> the UIDs the messages got in the destination, in the same order, when the server tells (UIDPLUS)
     */
    public function move(RemoteUser $user, string $folder, array $uids, string $to): array
    {
        return Mailbox::open($this->clients, $user, $folder, false, static function (Mailbox $mailbox) use ($uids, $to): array {
            try {
                $response = $mailbox->command('UID MOVE', sprintf('%s %s', Mailbox::set($uids), Mailbox::quote($to)));
            } catch (ImapCommandFailed $e) {
                if ($e->isNonExistent() || str_contains(strtolower($e->text), 'trycreate')) {
                    throw new NotFoundHttpException(sprintf('No folder "%s"', $to), $e);
                }
                throw $e;
            }

            // "* OK [COPYUID 1234 7,8 40,41] Moved."
            foreach ($response->untagged as $line) {
                if (1 === preg_match('/\[COPYUID \d+ [\d:,]+ ([\d:,]+)\]/', $line, $m)) {
                    return self::expandSet($m[1]);
                }
            }

            return [];
        });
    }

    /**
     * Gone for good: flagged deleted then expunged, no trash involved.
     *
     * @param list<int> $uids
     */
    public function delete(RemoteUser $user, string $folder, array $uids): void
    {
        Mailbox::open($this->clients, $user, $folder, false, static function (Mailbox $mailbox) use ($uids): void {
            $mailbox->command('UID STORE', sprintf('%s +FLAGS.SILENT (\Deleted)', Mailbox::set($uids)));
            $mailbox->command('UID EXPUNGE', Mailbox::set($uids));
        });
    }

    /**
     * "40,42:44" to [40, 42, 43, 44].
     *
     * @return list<int>
     */
    private static function expandSet(string $set): array
    {
        $uids = [];
        foreach (explode(',', $set) as $piece) {
            if (str_contains($piece, ':')) {
                [$from, $to] = array_map('intval', explode(':', $piece, 2));
                $uids = [...$uids, ...range(min($from, $to), max($from, $to))];
            } else {
                $uids[] = (int) $piece;
            }
        }

        return $uids;
    }
}
