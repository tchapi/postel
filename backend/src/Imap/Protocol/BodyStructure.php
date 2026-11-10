<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

use function count;
use function is_array;
use function is_string;

use const ICONV_MIME_DECODE_CONTINUE_ON_ERROR;

/**
 * Builds the part tree out of a tokenized BODYSTRUCTURE item (RFC 3501 §7.4.2).
 */
final class BodyStructure
{
    /**
     * @param list<mixed> $tokens
     */
    public static function parse(array $tokens): BodyPart
    {
        return self::part($tokens, '');
    }

    /**
     * @param list<mixed> $tokens
     */
    private static function part(array $tokens, string $section): BodyPart
    {
        if (is_array($tokens[0] ?? null)) {
            // multipart: (part)(part)... "subtype" (params) (disposition) (language) (location)
            $children = [];
            $i = 0;
            while (is_array($tokens[$i] ?? null)) {
                $index = (string) ($i + 1);
                $children[] = self::part(array_values($tokens[$i]), '' === $section ? $index : $section.'.'.$index);
                ++$i;
            }
            $subtype = self::string($tokens, $i) ?? 'mixed';
            $parameters = self::pairs($tokens[$i + 1] ?? null);
            [$disposition, $dispositionParameters] = self::disposition($tokens[$i + 2] ?? null);

            return new BodyPart(
                section: $section,
                type: 'multipart',
                subtype: $subtype,
                parameters: $parameters,
                disposition: $disposition,
                dispositionParameters: $dispositionParameters,
                children: $children,
            );
        }

        // single part: type subtype (params) id description encoding size [lines | (envelope body lines)] md5 (disposition) (language) (location)
        $type = self::string($tokens, 0) ?? 'application';
        $subtype = self::string($tokens, 1) ?? 'octet-stream';
        $parameters = self::pairs($tokens[2] ?? null);
        $contentId = self::string($tokens, 3);
        $encoding = self::string($tokens, 5);
        $encoding = null === $encoding ? null : strtolower($encoding);
        $size = (int) ($tokens[6] ?? 0);

        // Extension data starts after the body-type-specific fields.
        $next = match (strtolower($type)) {
            'text' => 8,
            'message' => 'rfc822' === strtolower($subtype) ? 10 : 7,
            default => 7,
        };
        [$disposition, $dispositionParameters] = self::disposition($tokens[$next + 1] ?? null);

        return new BodyPart(
            section: '' === $section ? '1' : $section,
            type: $type,
            subtype: $subtype,
            parameters: $parameters,
            contentId: $contentId,
            encoding: $encoding,
            size: $size,
            disposition: $disposition,
            dispositionParameters: $dispositionParameters,
        );
    }

    /**
     * @param array<int, mixed> $tokens
     */
    private static function string(array $tokens, int $index): ?string
    {
        $value = $tokens[$index] ?? null;

        return is_string($value) ? $value : null;
    }

    /**
     * ("name" "value" "name" "value") to an associative array. RFC 2231
     * parameters ("filename*", or "filename*0*" "filename*1*" when the server
     * did not join the pieces) end up under their plain name.
     *
     * @return array<string, string>
     */
    private static function pairs(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }
        $pairs = [];
        $extended = [];
        for ($i = 0; $i + 1 < count($list); $i += 2) {
            if (!is_string($list[$i]) || !is_string($list[$i + 1])) {
                continue;
            }
            $name = strtolower($list[$i]);
            if (1 === preg_match('/^([^*]+)\*(\d+)?(\*)?$/', $name, $m)) {
                $extended[$m[1]][(int) ($m[2] ?? 0)] = ['value' => $list[$i + 1], 'encoded' => '*' === substr($name, -1)];
            } else {
                $pairs[$name] = self::decodeParameter($list[$i + 1]);
            }
        }

        // the extended form wins over the plain one, which is only there for old clients
        foreach ($extended as $name => $pieces) {
            ksort($pieces);
            $charset = 'UTF-8';
            $value = '';
            foreach ($pieces as $index => $piece) {
                $text = $piece['value'];
                if ($piece['encoded']) {
                    // only the first piece carries charset'language'
                    if (0 === $index && 1 === preg_match("/^([^']*)'[^']*'(.*)$/s", $text, $m)) {
                        $charset = '' === $m[1] ? $charset : $m[1];
                        $text = $m[2];
                    }
                    $text = rawurldecode($text);
                }
                $value .= $text;
            }
            $converted = 'UTF-8' === strtoupper($charset) ? $value : @iconv($charset, 'UTF-8//IGNORE', $value);
            $pairs[$name] = is_string($converted) && mb_check_encoding($converted, 'UTF-8') ? $converted : mb_scrub($value, 'UTF-8');
        }

        return $pairs;
    }

    /**
     * @return array{0: ?string, 1: array<string, string>}
     */
    private static function disposition(mixed $list): array
    {
        if (!is_array($list) || !is_string($list[0] ?? null)) {
            return [null, []];
        }

        return [strtolower($list[0]), self::pairs($list[1] ?? null)];
    }

    /**
     * Filenames come either RFC 2047 encoded or, less often, raw.
     */
    private static function decodeParameter(string $value): string
    {
        if (str_contains($value, '=?')) {
            $decoded = @iconv_mime_decode($value, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if (is_string($decoded)) {
                return $decoded;
            }
        }

        return $value;
    }
}
