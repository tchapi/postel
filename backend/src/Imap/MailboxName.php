<?php

declare(strict_types=1);

namespace App\Imap;

use Normalizer;

/**
 * Mailbox names travel in modified UTF-7 (RFC 3501 §5.1.3): "Pr&AOk-" is
 * "Pré". Paths stay encoded for IMAP commands, only display names are decoded.
 * Composed to NFC, as some clients store accents as combining marks.
 */
final class MailboxName
{
    public static function decode(string $name): string
    {
        $decoded = (string) preg_replace_callback('/&([^-]*)-/', static function (array $match): string {
            if ('' === $match[1]) {
                return '&';
            }

            $utf16 = base64_decode(strtr($match[1], ',', '/'), true);
            $utf8 = false === $utf16 ? false : @iconv('UTF-16BE', 'UTF-8', $utf16);

            return false === $utf8 ? $match[0] : $utf8;
        }, $name);

        return Normalizer::normalize($decoded) ?: $decoded;
    }
}
