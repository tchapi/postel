<?php

declare(strict_types=1);

namespace App\Imap;

use App\Imap\Dto\Attachment;
use App\Imap\Dto\Message;
use App\Imap\Dto\PartContent;
use App\Imap\Protocol\BodyPart;
use App\Imap\Protocol\BodyStructure;
use App\Imap\Protocol\FetchItem;
use App\Mail\Headers;
use App\Mail\HtmlRenderer;
use App\Mail\MessageParser;
use App\Mail\TextRenderer;
use App\Security\RemoteUser;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use ZBateson\MailMimeParser\Message\IMimePart;

use function in_array;
use function sprintf;

final class MessageService
{
    public function __construct(
        private readonly ImapClientFactory $clients,
        private readonly MessageParser $parser,
        private readonly HtmlRenderer $html,
    ) {
    }

    public function get(RemoteUser $user, string $folder, int $uid, bool $remoteImages): Message
    {
        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($folder, $uid, $remoteImages): Message {
            $items = $mailbox->command('UID FETCH', sprintf('%d (UID FLAGS RFC822.SIZE INTERNALDATE BODYSTRUCTURE BODY.PEEK[])', $uid))->tokenized('FETCH');
            $item = $this->single($items, $uid);

            $structureTokens = $item->list('BODYSTRUCTURE');
            $structure = null === $structureTokens ? null : BodyStructure::parse($structureTokens);
            $parsed = $this->parser->parse($item->section('') ?? '');
            $headers = new Headers($parsed);
            $flags = array_map('strtolower', $item->flags());

            $html = null;
            $hasRemoteImages = false;
            $rawHtml = $parsed->getHtmlContent();
            if (null !== $rawHtml && '' !== trim($rawHtml) && null !== $structure) {
                $rendered = $this->html->render($rawHtml, HtmlRenderer::partUrlResolver($structure, $folder, $uid), $remoteImages);
                $html = $rendered['html'];
                $hasRemoteImages = $rendered['hasRemoteImages'];
            }

            $text = $parsed->getTextContent();
            $textPart = $parsed->getTextPart();
            if (null !== $text && $textPart instanceof IMimePart && 'flowed' === strtolower((string) $textPart->getHeaderParameter('Content-Type', 'format'))) {
                $text = TextRenderer::unflow($text, 'yes' === strtolower((string) $textPart->getHeaderParameter('Content-Type', 'delsp')));
            }

            return new Message(
                uid: $uid,
                folder: $folder,
                from: $headers->from(),
                to: $headers->addresses('To'),
                cc: $headers->addresses('Cc'),
                bcc: $headers->addresses('Bcc'),
                replyTo: $headers->addresses('Reply-To'),
                subject: $headers->subject(),
                date: $headers->date() ?? MessageListService::internalDate($item->string('INTERNALDATE')),
                seen: in_array('\seen', $flags, true),
                flagged: in_array('\flagged', $flags, true),
                answered: in_array('\answered', $flags, true),
                draft: in_array('\draft', $flags, true),
                size: (int) ($item->string('RFC822.SIZE') ?? 0),
                messageId: $headers->messageId(),
                html: $html,
                text: null === $text || '' === trim($text) ? null : $text,
                hasRemoteImages: $hasRemoteImages,
                remoteImagesLoaded: $remoteImages,
                attachments: null === $structure ? [] : array_map(self::attachment(...), $structure->attachments()),
            );
        });
    }

    /**
     * The message exactly as stored, headers and all.
     */
    public function raw(RemoteUser $user, string $folder, int $uid): string
    {
        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($uid): string {
            $items = $mailbox->command('UID FETCH', sprintf('%d (UID BODY.PEEK[])', $uid))->tokenized('FETCH');

            return $this->single($items, $uid)->section('') ?? throw new NotFoundHttpException(sprintf('No message %d', $uid));
        });
    }

    /**
     * One MIME part, transfer encoding removed, as the browser should get it.
     */
    public function part(RemoteUser $user, string $folder, int $uid, string $section): PartContent
    {
        if (1 !== preg_match('/^\d+(\.\d+)*$/', $section)) {
            throw new NotFoundHttpException('No such part');
        }

        return Mailbox::open($this->clients, $user, $folder, true, function (Mailbox $mailbox) use ($uid, $section): PartContent {
            $items = $mailbox->command('UID FETCH', sprintf('%d (UID BODYSTRUCTURE BODY.PEEK[%s])', $uid, $section))->tokenized('FETCH');
            $item = $this->single($items, $uid);

            $structureTokens = $item->list('BODYSTRUCTURE');
            $part = null === $structureTokens ? null : BodyStructure::parse($structureTokens)->find($section);
            $content = $item->section($section);
            if (null === $part || null === $content) {
                throw new NotFoundHttpException('No such part');
            }

            $decoded = match ($part->encoding) {
                'base64' => (string) base64_decode($content, false),
                'quoted-printable' => quoted_printable_decode($content),
                default => $content,
            };

            return new PartContent($decoded, $part->mimeType(), $part->filename());
        });
    }

    /**
     * @param list<list<mixed>> $items
     */
    private function single(array $items, int $uid): FetchItem
    {
        foreach ($items as $tokens) {
            $item = FetchItem::fromTokens($tokens);
            if ($item->uid() === $uid) {
                return $item;
            }
        }

        throw new NotFoundHttpException(sprintf('No message %d', $uid));
    }

    private static function attachment(BodyPart $part): Attachment
    {
        return new Attachment(
            id: $part->section,
            name: $part->filename() ?? ('part-'.$part->section),
            size: $part->size,
            mime: $part->mimeType(),
            inline: $part->isInline(),
        );
    }
}
