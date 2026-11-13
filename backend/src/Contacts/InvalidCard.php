<?php

declare(strict_types=1);

namespace App\Contacts;

use RuntimeException;

/**
 * Text that is not a vCard the app can read.
 */
final class InvalidCard extends RuntimeException
{
}
