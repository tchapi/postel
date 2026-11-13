<?php

declare(strict_types=1);

namespace App\Contacts;

use RuntimeException;

/**
 * The card, or its address book, is not on the server any more (HTTP 404).
 */
final class CardGone extends RuntimeException
{
}
