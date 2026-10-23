<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

use function is_string;

final readonly class ImapResponse
{
    /**
     * @param list<string> $untagged raw untagged lines, literals included, without the trailing CRLF
     */
    public function __construct(
        public array $untagged,
        public string $status,
        public string $text,
    ) {
    }

    /**
     * The untagged responses of a given kind ("FETCH", "SORT"), tokenized.
     *
     * @return list<list<mixed>>
     */
    public function tokenized(string $kind): array
    {
        $rows = [];
        foreach ($this->untagged as $line) {
            $tokens = Tokenizer::parse($line);
            // "* 12 FETCH (...)" or "* SORT 1 2 3"
            $name = is_numeric($tokens[1] ?? null) ? ($tokens[2] ?? null) : ($tokens[1] ?? null);
            if (is_string($name) && strtoupper($name) === $kind) {
                $rows[] = $tokens;
            }
        }

        return $rows;
    }
}
