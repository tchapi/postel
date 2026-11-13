<?php

declare(strict_types=1);

namespace App\Contacts;

use InvalidArgumentException;

use function in_array;

use const IMAGETYPE_GIF;
use const IMAGETYPE_JPEG;
use const IMAGETYPE_PNG;
use const IMAGETYPE_WEBP;

/**
 * A contact picture as the app writes it: decoded, at most 512 pixels a
 * side, saved again as JPEG. The uploaded bytes are never kept, so nothing
 * hidden in the file reaches the card.
 */
final class Picture
{
    public const int SIZE = 512;

    /** Larger images would take too much memory to decode */
    private const int MAX_PIXELS = 40_000_000;

    /**
     * @throws InvalidArgumentException when it is not a JPEG, PNG, WebP or GIF image
     */
    public static function jpeg(string $bytes): string
    {
        $info = '' === $bytes ? false : @getimagesizefromstring($bytes);
        if (false === $info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
            throw new InvalidArgumentException('Not a JPEG, PNG, WebP or GIF image');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width * $height > self::MAX_PIXELS) {
            throw new InvalidArgumentException('Image too large');
        }
        $source = @imagecreatefromstring($bytes);
        if (false === $source) {
            throw new InvalidArgumentException('Unreadable image');
        }

        $scale = min(1, self::SIZE / max($width, $height));
        $w = max(1, (int) round($width * $scale));
        $h = max(1, (int) round($height * $scale));
        $target = imagecreatetruecolor($w, $h);
        if (false === $target) {
            throw new InvalidArgumentException('Image too large');
        }
        // Transparent parts of a PNG or GIF become white rather than black
        imagefill($target, 0, 0, (int) imagecolorallocate($target, 255, 255, 255));
        imagecopyresampled($target, $source, 0, 0, 0, 0, $w, $h, $width, $height);

        ob_start();
        imagejpeg($target, null, 85);

        return (string) ob_get_clean();
    }
}
