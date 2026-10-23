<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Dto\MessagePage;
use App\Imap\Dto\MessageRow;
use App\Imap\Protocol\BodyStructure;
use App\Imap\Protocol\FetchItem;
use App\Mail\MessageParser;
use App\Security\RemoteUser;
use DateTimeImmutable;

use function array_slice;
use function count;
use function in_array;
use function sprintf;

final class MessageListService
{
    public const int MAX_PER_PAGE = 100;

    private const string HEADER_FIELDS = 'FROM SUBJECT DATE';

    private const array SORT_KEYS = [
        'date' => 'DATE',
        'arrival' => 'ARRIVAL',
        'size' => 'SIZE',
        'from' => 'FROM',
        'subject' => 'SUBJECT',
    ];

    public function __construct(
        private readonly ImapClientFactory $clients,
        private readonly MessageParser $parser,
    ) {
    }

    public static function isSort(string $sort): bool
    {
        return isset(self::SORT_KEYS[$sort]);
    }

    public function page(RemoteUser $user, string $folder, int $page, int $perPage, string $sort = 'date', bool $descending = true, string $search = 'ALL'): MessagePage
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $page = max(1, $page);
        $criteria = ($descending ? 'REVERSE ' : '').(self::SORT_KEYS[$sort] ?? 'DATE');

        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($folder, $page, $perPage, $criteria, $search): MessagePage {
            $uids = $mailbox->sort($criteria, $search);
            $slice = array_slice($uids, ($page - 1) * $perPage, $perPage);
            if ([] === $slice) {
                return new MessagePage([], count($uids), $page, $perPage);
            }

            $rows = $this->rows($mailbox, $folder, $slice);

            return new MessagePage(array_values(array_filter(array_map(static fn (int $uid) => $rows[$uid] ?? null, $slice))), count($uids), $page, $perPage);
        });
    }

    /**
     * One row per conversation, newest conversation first. The row is the
     * newest message of the conversation, unread if any of it is, starred if
     * any of it is.
     */
    public function threads(RemoteUser $user, string $folder, int $page, int $perPage, string $search = 'ALL'): MessagePage
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $page = max(1, $page);

        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($folder, $page, $perPage, $search): MessagePage {
            $rank = array_flip($mailbox->sort('REVERSE DATE', $search));
            $threads = [];
            foreach ($mailbox->threads($search) as $members) {
                $members = array_values(array_filter($members, static fn (int $uid) => isset($rank[$uid])));
                if ([] === $members) {
                    continue;
                }
                usort($members, static fn (int $a, int $b) => $rank[$b] <=> $rank[$a]);
                $threads[] = $members;
            }
            // Newest conversation first: the one whose newest message ranks best.
            usort($threads, static fn (array $a, array $b) => $rank[$a[count($a) - 1]] <=> $rank[$b[count($b) - 1]]);

            $slice = array_slice($threads, ($page - 1) * $perPage, $perPage);
            if ([] === $slice) {
                return new MessagePage([], count($threads), $page, $perPage);
            }

            $latest = array_map(static fn (array $members) => $members[count($members) - 1], $slice);
            $rows = $this->rows($mailbox, $folder, $latest);
            $flags = $this->flags($mailbox, array_merge(...$slice));

            $items = [];
            foreach ($slice as $members) {
                $row = $rows[$members[count($members) - 1]] ?? null;
                if (null === $row) {
                    continue;
                }
                $memberFlags = array_map(static fn (int $uid) => $flags[$uid] ?? [], $members);
                $items[] = new MessageRow(
                    uid: $row->uid,
                    folder: $row->folder,
                    from: $row->from,
                    subject: $row->subject,
                    snippet: $row->snippet,
                    date: $row->date,
                    seen: [] === array_filter($memberFlags, static fn (array $f) => !in_array('\seen', $f, true)),
                    flagged: [] !== array_filter($memberFlags, static fn (array $f) => in_array('\flagged', $f, true)),
                    hasAttachments: $row->hasAttachments,
                    size: $row->size,
                    threadSize: count($members),
                    threadUids: $members,
                );
            }

            return new MessagePage($items, count($threads), $page, $perPage);
        });
    }

    /**
     * Search every folder but Trash and Junk, newest first. Each folder only
     * has to give its first page × perPage matches to serve that page.
     */
    public function searchAll(RemoteUser $user, int $page, int $perPage, string $search): MessagePage
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $page = max(1, $page);
        $depth = $page * $perPage;

        return Mailbox::session($this->clients, $user, function (Mailbox $mailbox) use ($page, $perPage, $depth, $search): MessagePage {
            $total = 0;
            $candidates = [];
            foreach ($mailbox->folders() as $folder => $flags) {
                $role = FolderRole::detect($folder, $flags);
                $noSelect = [] !== array_intersect(array_map('strtolower', $flags), ['\\noselect', '\\nonexistent']);
                if ($noSelect || FolderRole::Trash === $role || FolderRole::Junk === $role) {
                    continue;
                }
                $mailbox->examine($folder);
                $uids = $mailbox->sort('REVERSE DATE', $search);
                $total += count($uids);
                $top = array_slice($uids, 0, $depth);
                if ([] === $top) {
                    continue;
                }
                foreach ($mailbox->command('UID FETCH', Mailbox::set($top).' (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (DATE)])')->tokenized('FETCH') as $tokens) {
                    $item = FetchItem::fromTokens($tokens);
                    $date = $this->parser->parseHeaders($item->section('HEADER.FIELDS (DATE)') ?? '')->date() ?? self::internalDate($item->string('INTERNALDATE'));
                    $candidates[] = ['folder' => $folder, 'uid' => $item->uid(), 'at' => $date?->getTimestamp() ?? 0];
                }
            }

            usort($candidates, static fn (array $a, array $b) => [$b['at'], $a['folder'], $b['uid']] <=> [$a['at'], $b['folder'], $a['uid']]);
            $slice = array_slice($candidates, ($page - 1) * $perPage, $perPage);

            $byFolder = [];
            foreach ($slice as $hit) {
                $byFolder[$hit['folder']][] = $hit['uid'];
            }
            $rows = [];
            foreach ($byFolder as $folder => $uids) {
                $mailbox->examine($folder);
                foreach ($this->rows($mailbox, $folder, $uids) as $uid => $row) {
                    $rows[$folder."\0".$uid] = $row;
                }
            }

            $items = [];
            foreach ($slice as $hit) {
                if (isset($rows[$hit['folder']."\0".$hit['uid']])) {
                    $items[] = $rows[$hit['folder']."\0".$hit['uid']];
                }
            }

            return new MessagePage($items, $total, $page, $perPage);
        });
    }

    /** Long conversations are cut to their newest messages. */
    public const int MAX_THREAD = 100;

    /**
     * The conversation a message belongs to, oldest first.
     *
     * @return list<MessageRow>
     */
    public function thread(RemoteUser $user, string $folder, int $uid): array
    {
        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($folder, $uid): array {
            $members = [$uid];
            foreach ($mailbox->threads('ALL') as $thread) {
                if (in_array($uid, $thread, true)) {
                    $members = $thread;
                    break;
                }
            }
            // Same order as the threaded list, so its newest message is our last one.
            $newestFirst = $mailbox->sort('REVERSE DATE', 'UID '.Mailbox::set($members));
            $members = array_slice($newestFirst, 0, self::MAX_THREAD);
            $rank = array_flip($members);
            $rows = array_values($this->rows($mailbox, $folder, $members));
            usort($rows, static fn (MessageRow $a, MessageRow $b) => ($rank[$b->uid] ?? 0) <=> ($rank[$a->uid] ?? 0));

            return $rows;
        });
    }

    /**
     * @param list<int> $uids
     *
     * @return array<int, MessageRow>
     */
    private function rows(Mailbox $mailbox, string $folder, array $uids): array
    {
        $response = $mailbox->command('UID FETCH', sprintf(
            '%s (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE PREVIEW BODY.PEEK[HEADER.FIELDS (%s)])',
            Mailbox::set($uids),
            self::HEADER_FIELDS,
        ));

        $rows = [];
        foreach ($response->tokenized('FETCH') as $tokens) {
            $item = FetchItem::fromTokens($tokens);
            $rows[$item->uid()] = $this->row($item, $folder);
        }

        return $rows;
    }

    /**
     * @param list<int> $uids
     *
     * @return array<int, list<string>> lowercased flags by UID
     */
    private function flags(Mailbox $mailbox, array $uids): array
    {
        $flags = [];
        foreach ($mailbox->command('UID FETCH', Mailbox::set($uids).' (UID FLAGS)')->tokenized('FETCH') as $tokens) {
            $item = FetchItem::fromTokens($tokens);
            $flags[$item->uid()] = array_map('strtolower', $item->flags());
        }

        return $flags;
    }

    private function row(FetchItem $item, string $folder): MessageRow
    {
        $headers = $this->parser->parseHeaders($item->section('HEADER.FIELDS ('.self::HEADER_FIELDS.')') ?? '');
        $flags = array_map('strtolower', $item->flags());
        $structure = $item->list('BODYSTRUCTURE');

        return new MessageRow(
            uid: $item->uid(),
            folder: $folder,
            from: $headers->from(),
            subject: $headers->subject(),
            snippet: trim(preg_replace('/\s+/', ' ', $item->string('PREVIEW') ?? '') ?? ''),
            date: $headers->date() ?? self::internalDate($item->string('INTERNALDATE')),
            seen: in_array('\seen', $flags, true),
            flagged: in_array('\flagged', $flags, true),
            hasAttachments: null !== $structure && [] !== BodyStructure::parse($structure)->attachments(),
            size: (int) ($item->string('RFC822.SIZE') ?? 0),
        );
    }

    public static function internalDate(?string $value): ?DateTimeImmutable
    {
        if (null === $value) {
            return null;
        }
        $date = DateTimeImmutable::createFromFormat('d-M-Y H:i:s O', trim($value));

        return false === $date ? null : $date;
    }
}
