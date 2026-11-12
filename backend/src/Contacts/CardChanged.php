<?php

declare(strict_types=1);

namespace App\Contacts;

use RuntimeException;

/**
 * The card changed on the server since it was read: its ETag no longer matches (HTTP 412).
 */
final class CardChanged extends RuntimeException
{
}
