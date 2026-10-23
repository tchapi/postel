<?php

declare(strict_types=1);

namespace App\Contacts;

use function count;

use const FILTER_VALIDATE_EMAIL;

/**
 * Reads the names and addresses out of a vCard (3.0 or 4.0), nothing else:
 * that is all autocomplete needs, and sabre/vobject would be a lot for it.
 */
final class VCard
{
    /**
     * One entry per address: a card with a work and a home address gives two.
     *
     * @return list<array{name: ?string, email: string}>
     */
    public static function addresses(string $card): array
    {
        // Folded lines continue with a space or a tab, RFC 6350 section 3.2
        $unfolded = preg_replace("/\r?\n[ \t]/", '', $card) ?? $card;

        $name = null;
        $emails = [];
        foreach (preg_split("/\r?\n/", $unfolded) ?: [] as $line) {
            $parts = explode(':', $line, 2);
            if (2 !== count($parts)) {
                continue;
            }
            // "item1.EMAIL;TYPE=work" -> "EMAIL", Apple groups properties this way
            $property = strtoupper(explode(';', $parts[0], 2)[0]);
            $dot = strrpos($property, '.');
            $property = false === $dot ? $property : substr($property, $dot + 1);
            $value = self::unescape(trim($parts[1]));

            if ('FN' === $property && '' !== $value) {
                $name = $value;
            } elseif ('EMAIL' === $property) {
                $email = strtolower(preg_replace('/^mailto:/i', '', $value) ?? $value);
                if (false !== filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $emails[$email] = true;
                }
            }
        }

        return array_map(static fn (string $email) => ['name' => $name, 'email' => $email], array_keys($emails));
    }

    private static function unescape(string $value): string
    {
        return strtr($value, ['\\n' => ' ', '\\N' => ' ', '\\,' => ',', '\;' => ';', '\\\\' => '\\']);
    }
}
