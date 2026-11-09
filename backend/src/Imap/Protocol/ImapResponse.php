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
            if (self::kind($tokens) === $kind) {
                $rows[] = $tokens;
            }
        }

        return $rows;
    }

    /**
     * "* 12 FETCH (...)" or "* SORT 1 2 3": the response name, uppercased.
     *
     * @param list<mixed> $tokens
     */
    private static function kind(array $tokens): ?string
    {
        $name = $tokens[1] ?? null;
        if (is_numeric($name)) {
            $name = $tokens[2] ?? null;
        }

        return is_string($name) ? strtoupper($name) : null;
    }
}
