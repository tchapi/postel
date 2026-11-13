<?php

declare(strict_types=1);

namespace App\Contacts;

/**
 * The server would not take this card (HTTP 400, 403, 415...), while it answers the others.
 */
final class CardRefused extends DavisUnavailable
{
}
