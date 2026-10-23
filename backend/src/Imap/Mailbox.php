<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Exception\ImapCommandFailed;
use App\Imap\Protocol\ImapResponse;
use App\Imap\Protocol\RawCommand;
use App\Security\RemoteUser;
use LogicException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Webklex\PHPIMAP\Connection\Protocols\ImapProtocol;

use function array_slice;
use function is_array;
use function is_string;
use function sprintf;

/**
 * A connected IMAP session on one folder, closed when the callback returns.
 */
final class Mailbox
{
    private function __construct(
        private readonly ImapProtocol $protocol,
        private readonly RawCommand $commands,
    ) {
    }

    /**
     * @template T
     *
     * @param callable(Mailbox): T $work
     *
     * @return T
     */
    public static function open(ImapClientFactory $clients, RemoteUser $user, string $folder, bool $readOnly, callable $work): mixed
    {
        $client = $clients->forUser($user);
        $client->connect();

        try {
            $protocol = $client->getConnection();
            if (!$protocol instanceof ImapProtocol) {
                throw new LogicException('IMAP only');
            }
            $mailbox = new self($protocol, new RawCommand($protocol));
            $mailbox->select($folder, $readOnly);

            return $work($mailbox);
        } finally {
            $client->disconnect();
        }
    }

    public function command(string $command, string $arguments = ''): ImapResponse
    {
        return $this->commands->run($command, $arguments);
    }

    /**
     * @return list<int>
     */
    public function sort(string $criteria, string $search = 'ALL'): array
    {
        $uids = [];
        foreach ($this->command('UID SORT', sprintf('(%s) UTF-8 %s', $criteria, $search))->tokenized('SORT') as $row) {
            foreach (array_slice($row, 2) as $token) {
                if (is_string($token) && is_numeric($token)) {
                    $uids[] = (int) $token;
                }
            }
        }

        return $uids;
    }

    /**
     * APPEND through webklex (it handles the literal continuation), the new
     * UID read from the UIDPLUS answer when the server gives one.
     *
     * @param list<string> $flags
     */
    public function append(string $folder, string $raw, array $flags = []): ?int
    {
        $response = $this->protocol->appendMessage($folder, $raw, $flags);
        foreach ($response->getResponse() as $line) {
            $line = is_array($line) ? implode(' ', array_map('strval', array_filter($line, 'is_scalar'))) : (string) $line;
            if (1 === preg_match('/APPENDUID \d+ (\d+)/', $line, $m)) {
                return (int) $m[1];
            }
        }

        return null;
    }

    private function select(string $folder, bool $readOnly): void
    {
        try {
            $this->command($readOnly ? 'EXAMINE' : 'SELECT', self::quote($folder));
        } catch (ImapCommandFailed $e) {
            if ($e->isNonExistent()) {
                throw new NotFoundHttpException(sprintf('No folder "%s"', $folder), $e);
            }
            throw $e;
        }
    }

    /**
     * Conversations as UID lists. REFS (Dovecot) only follows the References
     * headers; REFERENCES (RFC 5256) also merges by subject, which glues every
     * "Re: Invoice" together, so it is only the fallback.
     *
     * @return list<list<int>>
     */
    public function threads(string $search = 'ALL'): array
    {
        try {
            $response = $this->command('UID THREAD', 'REFS UTF-8 '.$search);
        } catch (ImapCommandFailed) {
            $response = $this->command('UID THREAD', 'REFERENCES UTF-8 '.$search);
        }

        $threads = [];
        foreach ($response->tokenized('THREAD') as $row) {
            foreach (array_slice($row, 2) as $thread) {
                $uids = self::flatten(is_array($thread) ? $thread : [$thread]);
                if ([] !== $uids) {
                    $threads[] = $uids;
                }
            }
        }

        return $threads;
    }

    /**
     * @param array<mixed> $tree
     *
     * @return list<int>
     */
    private static function flatten(array $tree): array
    {
        $uids = [];
        foreach ($tree as $node) {
            if (is_array($node)) {
                $uids = [...$uids, ...self::flatten($node)];
            } elseif (is_string($node) && is_numeric($node)) {
                $uids[] = (int) $node;
            }
        }

        return $uids;
    }

    public static function quote(string $value): string
    {
        return '"'.addcslashes($value, '"\\').'"';
    }

    /**
     * @param list<int> $uids
     */
    public static function set(array $uids): string
    {
        // "4:7,9" instead of "4,5,6,7,9": a conversation or a selection can be thousands long.
        $uids = array_values(array_unique($uids));
        sort($uids);
        $ranges = [];
        $start = $end = null;
        foreach ($uids as $uid) {
            if (null !== $end && $uid === $end + 1) {
                $end = $uid;
                continue;
            }
            if (null !== $start) {
                $ranges[] = $start === $end ? (string) $start : $start.':'.$end;
            }
            $start = $end = $uid;
        }
        if (null !== $start) {
            $ranges[] = $start === $end ? (string) $start : $start.':'.$end;
        }

        return implode(',', $ranges);
    }
}
