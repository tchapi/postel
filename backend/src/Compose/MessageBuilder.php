<?php

declare(strict_types=1);

namespace App\Compose;

use App\Compose\Request\Draft;
use App\Compose\Request\MessageRef;
use App\Compose\Request\Recipient;
use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Imap\MessageService;
use App\Imap\Protocol\FetchItem;
use App\Mail\MessageParser;
use App\Security\RemoteUser;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\File;

use function in_array;
use function sprintf;

use const ENT_HTML5;
use const ENT_QUOTES;

/**
 * Turns what the composer sent into a MIME message: identity, threading
 * headers, both body flavours, uploaded and carried-over attachments.
 */
final class MessageBuilder
{
    public function __construct(
        private readonly ImapClientFactory $clients,
        private readonly MessageService $messages,
        private readonly MessageParser $parser,
        private readonly UploadStore $uploads,
    ) {
    }

    public function build(RemoteUser $user, Draft $draft): Email
    {
        $email = (new Email())
            ->from(new Address($user->email, $user->displayName ?? ''))
            ->subject($draft->subject)
        ;
        foreach (['to', 'cc', 'bcc'] as $field) {
            /** @var list<Recipient> $recipients */
            $recipients = $draft->$field;
            if ([] !== $recipients) {
                $email->$field(...array_map(static fn (Recipient $r) => new Address($r->email, $r->name ?? ''), $recipients));
            }
        }

        $html = null === $draft->html || '' === trim(strip_tags($draft->html)) ? null : $draft->html;
        $text = $draft->text ?? (null === $html ? '' : self::toText($html));
        $email->text($text);
        if (null !== $html) {
            $email->html($html);
        }

        $original = $draft->inReplyTo ?? $draft->forwardOf;
        if (null !== $original) {
            $this->thread($email, $user, $original);
        }

        foreach ($draft->uploads as $id) {
            $upload = $this->uploads->get($user, $id);
            $email->addPart(new DataPart(new File($this->uploads->path($user, $id)), $upload->name, $upload->mime));
        }

        $carry = $draft->attachmentsFrom ?? $draft->forwardOf;
        if (null !== $carry) {
            $this->carryAttachments($email, $user, $carry);
        }

        return $email;
    }

    /**
     * In-Reply-To and References from the original, so clients thread it.
     */
    private function thread(Email $email, RemoteUser $user, MessageRef $original): void
    {
        $headers = Mailbox::open($this->clients, $user, $original->folder, true, static function (Mailbox $mailbox) use ($original): ?string {
            $items = $mailbox->command('UID FETCH', sprintf('%d (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES)])', $original->uid))->tokenized('FETCH');
            foreach ($items as $tokens) {
                $item = FetchItem::fromTokens($tokens);
                if ($item->uid() === $original->uid) {
                    return $item->section('HEADER.FIELDS (MESSAGE-ID REFERENCES)');
                }
            }

            return null;
        });
        if (null === $headers) {
            return;
        }

        $parsed = $this->parser->parseHeaders($headers);
        $messageId = $parsed->messageId();
        if (null === $messageId || '' === $messageId) {
            return;
        }
        $references = trim((string) $this->parser->parse(rtrim($headers)."\r\n\r\n")->getHeaderValue('References'));
        $email->getHeaders()->addIdHeader('In-Reply-To', trim($messageId, '<>'));
        $email->getHeaders()->addTextHeader('References', trim($references.' '.$messageId));
    }

    private function carryAttachments(Email $email, RemoteUser $user, MessageRef $from): void
    {
        $message = $this->messages->get($user, $from->folder, $from->uid, false);
        foreach ($message->attachments as $attachment) {
            if ($attachment->inline || (null !== $from->sections && !in_array($attachment->id, $from->sections, true))) {
                continue;
            }
            $part = $this->messages->part($user, $from->folder, $from->uid, $attachment->id);
            $email->addPart(new DataPart($part->content, $part->filename ?? $attachment->name, $part->mime));
        }
    }

    /**
     * A plain text alternative good enough for clients that ask for one.
     */
    public static function toText(string $html): string
    {
        $text = preg_replace('/<\/(p|h[1-6]|blockquote)\b[^>]*>/i', "\n\n", $html) ?? $html;
        $text = preg_replace('/<(br|\/div|\/li|\/tr)\b[^>]*>/i', "\n", $text) ?? $text;
        $text = preg_replace('/<blockquote\b[^>]*>/i', "\n> ", $text) ?? $text;
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace("/[ \t]+\n/", "\n", $text) ?? $text;
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;

        return trim($text);
    }
}
