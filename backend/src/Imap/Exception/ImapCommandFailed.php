<?php

declare(strict_types=1);

namespace App\Imap\Exception;

use RuntimeException;

use function sprintf;

/**
 * The server answered NO or BAD to a command.
 */
final class ImapCommandFailed extends RuntimeException
{
    public function __construct(
        public readonly string $command,
        public readonly string $status,
        public readonly string $text,
    ) {
        parent::__construct(sprintf('%s: %s %s', $command, $status, $text));
    }

    public function isNonExistent(): bool
    {
        return str_contains($this->text, '[NONEXISTENT]') || str_contains(strtolower($this->text), "doesn't exist");
    }
}
