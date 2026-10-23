<?php

declare(strict_types=1);

namespace App\Mail;

use ZBateson\MailMimeParser\IMessage;
use ZBateson\MailMimeParser\MailMimeParser;
use ZBateson\MailMimeParser\Message\IMessagePart;
use ZBateson\MailMimeParser\Message\IMimePart;

use function is_string;

/**
 * zbateson/mail-mime-parser with the one tweak the fixture corpus asked for:
 * a text part without a declared charset is read as UTF-8 when its bytes are
 * valid UTF-8, instead of the US-ASCII the RFC prescribes.
 */
final class MessageParser
{
    public function __construct(private readonly MailMimeParser $parser)
    {
    }

    public function parse(string $raw): IMessage
    {
        $message = $this->parser->parse($raw, false);
        foreach ($message->getAllParts() as $part) {
            $this->fixUndeclaredCharset($part);
        }

        return $message;
    }

    /**
     * Only the header block, for list rows. The body is left empty.
     */
    public function parseHeaders(string $headers): Headers
    {
        return new Headers($this->parser->parse(rtrim($headers)."\r\n\r\n", false));
    }

    private function fixUndeclaredCharset(IMessagePart $part): void
    {
        if (!$part instanceof IMimePart || !$part->isTextPart() || null !== $part->getHeaderParameter('Content-Type', 'charset')) {
            return;
        }

        $handle = $part->getBinaryContentResourceHandle();
        if (null === $handle) {
            return;
        }
        $bytes = stream_get_contents($handle);
        if (!is_string($bytes)) {
            return;
        }

        $part->setCharsetOverride(mb_check_encoding($bytes, 'UTF-8') ? 'UTF-8' : 'ISO-8859-1');
    }
}
