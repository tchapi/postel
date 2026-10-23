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
use function is_string;
use function sprintf;

/**
 * A connected IMAP session on one folder, closed when the callback returns.
 */
final class Mailbox
{
    private function __construct(private readonly RawCommand $commands)
    {
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
            $mailbox = new self(new RawCommand($protocol));
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

    public static function quote(string $value): string
    {
        return '"'.addcslashes($value, '"\\').'"';
    }

    /**
     * @param list<int> $uids
     */
    public static function set(array $uids): string
    {
        return implode(',', $uids);
    }
}
