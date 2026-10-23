<?php

declare(strict_types=1);

namespace App\Mail;

use function count;

/**
 * Plain text bodies: format=flowed is unwrapped (RFC 3676), nothing else.
 */
final class TextRenderer
{
    public static function unflow(string $text, bool $delSp = false): string
    {
        $lines = preg_split('/\r?\n/', $text) ?: [];
        $out = [];
        $previous = null;

        foreach ($lines as $line) {
            $quoteDepth = strspn($line, '>');
            $content = substr($line, $quoteDepth);
            if (str_starts_with($content, ' ')) {
                $content = substr($content, 1); // space stuffing
            }
            $flowed = str_ends_with($content, ' ') && '-- ' !== $content;
            if ($flowed && $delSp) {
                $content = substr($content, 0, -1);
            }

            if (null !== $previous && $previous['flowed'] && $previous['depth'] === $quoteDepth) {
                $out[count($out) - 1] .= $content;
            } else {
                $out[] = str_repeat('>', $quoteDepth).($quoteDepth > 0 ? ' ' : '').$content;
            }
            $previous = ['flowed' => $flowed, 'depth' => $quoteDepth];
        }

        return implode("\n", array_map(static fn (string $line) => rtrim($line, ' '), $out));
    }
}
