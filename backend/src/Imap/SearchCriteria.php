<?php

declare(strict_types=1);

namespace App\Imap;

use DateTimeImmutable;

use function sprintf;

/**
 * Builds the search key list of a UID SORT / UID SEARCH command.
 */
final class SearchCriteria
{
    /**
     * Free text matches the sender, recipients and subject. Bodies are left
     * out on purpose: without a full-text index Dovecot reads every message.
     */
    public static function build(?string $query, bool $unread = false, bool $flagged = false, bool $attachments = false, ?DateTimeImmutable $since = null, ?DateTimeImmutable $before = null): string
    {
        $keys = [];
        if ($attachments) {
            // Close enough without a body index: attachments live in multipart/mixed.
            $keys[] = 'HEADER Content-Type "multipart/mixed"';
        }
        if (null !== $since) {
            $keys[] = 'SINCE '.$since->format('j-M-Y');
        }
        if (null !== $before) {
            $keys[] = 'BEFORE '.$before->format('j-M-Y');
        }
        if ($unread) {
            $keys[] = 'UNSEEN';
        }
        if ($flagged) {
            $keys[] = 'FLAGGED';
        }

        $query = trim((string) $query);
        if ('' !== $query) {
            $quoted = Mailbox::quote($query);
            $keys[] = sprintf('OR OR FROM %1$s SUBJECT %1$s TO %1$s', $quoted);
        }

        return [] === $keys ? 'ALL' : implode(' ', $keys);
    }
}
