<?php

declare(strict_types=1);

namespace App\Contacts\Request;

/**
 * An ETag as the client got it from the API, sent back in an If-Match header.
 */
final class Etag
{
    /** Quoted, maybe weak, without control characters, so it cannot break the header */
    public const string PATTERN = '/^(W\/)?"[\x20\x21\x23-\x7e\x80-\xff]{0,200}"$/';

    public static function valid(?string $etag): bool
    {
        return null !== $etag && 1 === preg_match(self::PATTERN, $etag);
    }
}
