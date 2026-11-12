<?php

declare(strict_types=1);

namespace App\Contacts;

use function count;
use function in_array;
use function strlen;

use const FILTER_VALIDATE_EMAIL;

/**
 * Reads the names, addresses and picture out of a vCard (3.0 or 4.0), nothing
 * else: that is all the app needs, and sabre/vobject would be a lot for it.
 */
final class VCard
{
    /** Decoded bytes: larger pictures are left out rather than cached */
    private const int PHOTO_MAX_BYTES = 2_000_000;

    /** Picture types the app reads and serves, by the name vCard 3.0 gives them */
    public const array PHOTO_TYPES = ['JPEG' => 'image/jpeg', 'JPG' => 'image/jpeg', 'PNG' => 'image/png', 'GIF' => 'image/gif', 'WEBP' => 'image/webp'];

    /**
     * One entry per address: a card with a work and a home address gives two.
     * The photo is the card's inline picture (base64 in the card), or null: a
     * picture that is only a link is not fetched.
     *
     * @return list<array{name: ?string, email: string, photo: ?array{mime: string, data: string}}>
     */
    public static function addresses(string $card): array
    {
        // Folded lines continue with a space or a tab, RFC 6350 section 3.2
        $unfolded = preg_replace("/\r?\n[ \t]/", '', $card) ?? $card;

        $name = null;
        $photo = null;
        $emails = [];
        foreach (preg_split("/\r?\n/", $unfolded) ?: [] as $line) {
            $parts = explode(':', $line, 2);
            if (2 !== count($parts)) {
                continue;
            }
            // "item1.EMAIL;TYPE=work" -> "EMAIL", Apple groups properties this way
            $params = explode(';', $parts[0]);
            $property = strtoupper(array_shift($params));
            $dot = strrpos($property, '.');
            $property = false === $dot ? $property : substr($property, $dot + 1);
            $raw = trim($parts[1]);
            $value = self::unescape($raw);

            if ('FN' === $property && '' !== $value) {
                $name = $value;
            } elseif ('EMAIL' === $property) {
                $email = strtolower(preg_replace('/^mailto:/i', '', $value) ?? $value);
                if (false !== filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $emails[$email] = true;
                }
            } elseif ('PHOTO' === $property && null === $photo) {
                $photo = self::photo($params, $raw);
            }
        }

        return array_map(static fn (string $email) => ['name' => $name, 'email' => $email, 'photo' => $photo], array_keys($emails));
    }

    /**
     * vCard 3.0 writes `PHOTO;ENCODING=b;TYPE=JPEG:<base64>`, 4.0 writes `PHOTO:data:image/jpeg;base64,<base64>`.
     *
     * @param list<string> $params the property's parameters, "ENCODING=b", "TYPE=JPEG"
     *
     * @return ?array{mime: string, data: string}
     */
    private static function photo(array $params, string $value): ?array
    {
        $mime = null;
        $base64 = null;
        if (1 === preg_match('~^data:(image/[a-z0-9.+-]+);base64,(.*)$~is', $value, $m)) {
            $mime = strtolower($m[1]);
            $base64 = $m[2];
        } else {
            $encoded = false;
            foreach ($params as $param) {
                [$key, $val] = array_pad(explode('=', $param, 2), 2, '');
                $key = strtoupper($key);
                $val = strtoupper(trim($val, '"'));
                if ('ENCODING' === $key && in_array($val, ['B', 'BASE64'], true)) {
                    $encoded = true;
                } elseif ('TYPE' === $key || 'MEDIATYPE' === $key) {
                    $mime = self::PHOTO_TYPES[$val] ?? (str_starts_with(strtolower($val), 'image/') ? strtolower($val) : $mime);
                } elseif ('' === $val && isset(self::PHOTO_TYPES[$key])) {
                    // vCard 2.1 wrote the type bare: PHOTO;JPEG;ENCODING=BASE64:
                    $mime = self::PHOTO_TYPES[$key];
                } elseif ('' === $val && 'BASE64' === $key) {
                    $encoded = true;
                }
            }
            if ($encoded) {
                $base64 = $value;
            }
        }
        if (null === $base64 || null === $mime) {
            return null;
        }

        $data = base64_decode(preg_replace('/\s+/', '', $base64) ?? '', true);
        if (false === $data || '' === $data || strlen($data) > self::PHOTO_MAX_BYTES) {
            return null;
        }

        return ['mime' => $mime, 'data' => $data];
    }

    private static function unescape(string $value): string
    {
        return strtr($value, ['\\n' => ' ', '\\N' => ' ', '\\,' => ',', '\;' => ';', '\\\\' => '\\']);
    }
}
