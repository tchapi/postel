<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

use UnexpectedValueException;

use function strlen;

/**
 * Turns an IMAP response line into nested PHP values: atoms, quoted strings
 * and literals become strings, NIL becomes null, parenthesized lists become
 * arrays. Literals must already be inline, see RawCommand::readLine().
 */
final class Tokenizer
{
    private int $pos = 0;

    private function __construct(private readonly string $input)
    {
    }

    /**
     * @return list<mixed>
     */
    public static function parse(string $line): array
    {
        $tokenizer = new self($line);

        return $tokenizer->readSequence(null);
    }

    /**
     * @return list<mixed>
     */
    private function readSequence(?string $until): array
    {
        $tokens = [];
        $length = strlen($this->input);

        while ($this->pos < $length) {
            $char = $this->input[$this->pos];

            if (' ' === $char || "\r" === $char || "\n" === $char) {
                ++$this->pos;
                continue;
            }
            if ($until === $char) {
                ++$this->pos;

                return $tokens;
            }

            $tokens[] = match (true) {
                '(' === $char => $this->readList(),
                '"' === $char => $this->readQuoted(),
                '{' === $char => $this->readLiteral(),
                default => $this->readAtom(),
            };
        }

        return $tokens;
    }

    /**
     * @return list<mixed>
     */
    private function readList(): array
    {
        ++$this->pos; // (

        return $this->readSequence(')');
    }

    private function readQuoted(): string
    {
        ++$this->pos; // "
        $value = '';
        $length = strlen($this->input);

        while ($this->pos < $length) {
            $char = $this->input[$this->pos++];
            if ('\\' === $char && $this->pos < $length) {
                $value .= $this->input[$this->pos++];
                continue;
            }
            if ('"' === $char) {
                return $value;
            }
            $value .= $char;
        }

        return $value;
    }

    private function readLiteral(): string
    {
        $close = strpos($this->input, '}', $this->pos);
        if (false === $close) {
            throw new UnexpectedValueException('unterminated literal');
        }

        $size = (int) substr($this->input, $this->pos + 1, $close - $this->pos - 1);
        $start = $close + 1;
        if ("\r\n" === substr($this->input, $start, 2)) {
            $start += 2;
        }

        $this->pos = $start + $size;

        return substr($this->input, $start, $size);
    }

    /**
     * An atom runs to the next delimiter. "BODY[HEADER.FIELDS (FROM TO)]" is
     * one atom despite the spaces, so a "[" is consumed up to its "]".
     */
    private function readAtom(): ?string
    {
        $start = $this->pos;
        $length = strlen($this->input);

        while ($this->pos < $length) {
            $char = $this->input[$this->pos];
            if ('[' === $char) {
                $close = strpos($this->input, ']', $this->pos);
                $this->pos = false === $close ? $length : $close + 1;
                continue;
            }
            if (' ' === $char || '(' === $char || ')' === $char || '"' === $char || '{' === $char || "\r" === $char || "\n" === $char) {
                break;
            }
            ++$this->pos;
        }

        $atom = substr($this->input, $start, $this->pos - $start);

        return 'NIL' === strtoupper($atom) ? null : $atom;
    }
}
