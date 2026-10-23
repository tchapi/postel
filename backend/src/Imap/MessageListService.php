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

    public function page(RemoteUser $user, string $folder, int $page, int $perPage, string $sort = 'date', bool $descending = true): MessagePage
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $page = max(1, $page);
        $criteria = ($descending ? 'REVERSE ' : '').(self::SORT_KEYS[$sort] ?? 'DATE');

        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($folder, $page, $perPage, $criteria): MessagePage {
            $uids = $mailbox->sort($criteria);
            $slice = array_slice($uids, ($page - 1) * $perPage, $perPage);
            if ([] === $slice) {
                return new MessagePage([], count($uids), $page, $perPage);
            }

            $response = $mailbox->command('UID FETCH', sprintf(
                '%s (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE PREVIEW BODY.PEEK[HEADER.FIELDS (%s)])',
                Mailbox::set($slice),
                self::HEADER_FIELDS,
            ));

            $rows = [];
            foreach ($response->tokenized('FETCH') as $tokens) {
                $item = FetchItem::fromTokens($tokens);
                $rows[$item->uid()] = $this->row($item, $folder);
            }

            // Back in the server's sort order: FETCH answers in sequence order.
            $ordered = [];
            foreach ($slice as $uid) {
                if (isset($rows[$uid])) {
                    $ordered[] = $rows[$uid];
                }
            }

            return new MessagePage($ordered, count($uids), $page, $perPage);
        });
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
