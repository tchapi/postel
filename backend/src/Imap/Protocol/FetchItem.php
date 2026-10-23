<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

use UnexpectedValueException;

use function count;
use function is_array;
use function is_string;

/**
 * One "* n FETCH (key value key value ...)" response, keyed by item name.
 */
final class FetchItem
{
    /**
     * @param array<string, mixed> $items
     */
    private function __construct(private readonly array $items)
    {
    }

    /**
     * @param list<mixed> $tokens the tokenized untagged line
     */
    public static function fromTokens(array $tokens): self
    {
        $data = $tokens[3] ?? [];
        if (!is_array($data)) {
            throw new UnexpectedValueException('FETCH response without a data list');
        }

        $items = [];
        for ($i = 0, $n = count($data); $i + 1 < $n; $i += 2) {
            $key = $data[$i];
            if (!is_string($key)) {
                throw new UnexpectedValueException('FETCH item name is not an atom');
            }
            $items[self::normalize($key)] = $data[$i + 1];
        }

        return new self($items);
    }

    public function uid(): int
    {
        return (int) $this->string('UID');
    }

    /**
     * @return list<string>
     */
    public function flags(): array
    {
        $flags = $this->items['FLAGS'] ?? [];

        return is_array($flags) ? array_values(array_filter($flags, 'is_string')) : [];
    }

    public function string(string $key): ?string
    {
        $value = $this->items[self::normalize($key)] ?? null;

        return is_string($value) ? $value : null;
    }

    /**
     * @return list<mixed>|null
     */
    public function list(string $key): ?array
    {
        $value = $this->items[self::normalize($key)] ?? null;

        return is_array($value) ? array_values($value) : null;
    }

    /**
     * The content of a BODY[section] item, whatever the exact section spelling.
     */
    public function section(string $section): ?string
    {
        $wanted = 'BODY['.strtoupper($section).']';
        foreach ($this->items as $key => $value) {
            if (str_starts_with($key, 'BODY[') && self::squash($key) === self::squash($wanted) && is_string($value)) {
                return $value;
            }
        }

        return null;
    }

    private static function normalize(string $key): string
    {
        // "BODY.PEEK[x]" is answered as "BODY[x]"
        return str_replace('BODY.PEEK[', 'BODY[', strtoupper($key));
    }

    private static function squash(string $key): string
    {
        return preg_replace('/\s+/', '', $key) ?? $key;
    }
}
