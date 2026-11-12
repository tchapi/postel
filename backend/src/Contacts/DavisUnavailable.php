<?php

declare(strict_types=1);

namespace App\Contacts;

use RuntimeException;

/**
 * Davis refused the app key, is down or answered something unexpected.
 */
class DavisUnavailable extends RuntimeException
{
}
