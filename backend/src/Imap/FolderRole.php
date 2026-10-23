<?php

declare(strict_types=1);

namespace App\Imap;

/**
 * Well-known mailbox roles, from RFC 6154 SPECIAL-USE attributes with a name fallback.
 */
enum FolderRole: string
{
    case Inbox = 'inbox';
    case Drafts = 'drafts';
    case Sent = 'sent';
    case Junk = 'junk';
    case Trash = 'trash';
    case Archive = 'archive';

    /**
     * @param list<string> $attributes IMAP LIST attributes, e.g. "\Sent"
     */
    public static function detect(string $path, array $attributes): ?self
    {
        if ('INBOX' === strtoupper($path)) {
            return self::Inbox;
        }

        foreach ($attributes as $attribute) {
            $role = match (strtolower(ltrim($attribute, '\\'))) {
                'drafts' => self::Drafts,
                'sent' => self::Sent,
                'junk' => self::Junk,
                'trash' => self::Trash,
                'archive' => self::Archive,
                default => null,
            };

            if (null !== $role) {
                return $role;
            }
        }

        // Servers without SPECIAL-USE: fall back to the usual names.
        return match (strtolower($path)) {
            'drafts' => self::Drafts,
            'sent', 'sent messages', 'sent items' => self::Sent,
            'junk', 'spam' => self::Junk,
            'trash', 'deleted messages' => self::Trash,
            'archive', 'archives' => self::Archive,
            default => null,
        };
    }
}
