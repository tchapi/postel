<?php

declare(strict_types=1);

namespace App\Tests\Mail;

use App\Mail\Headers;
use App\Mail\MessageParser;
use DateTimeInterface;
use PHPUnit\Framework\TestCase;
use ZBateson\MailMimeParser\MailMimeParser;

final class MessageParserTest extends TestCase
{
    private MessageParser $parser;

    protected function setUp(): void
    {
        $this->parser = new MessageParser(new MailMimeParser());
    }

    private static function fixture(string $name): string
    {
        return (string) file_get_contents(__DIR__.'/../Fixtures/mail/'.$name.'.eml');
    }

    public function testEncodedHeadersAreDecoded(): void
    {
        $headers = new Headers($this->parser->parse(self::fixture('latin1')));

        $from = $headers->from();
        self::assertNotNull($from);
        self::assertSame("Réunion de rentrée à l'école", $headers->subject());
        self::assertSame('François Dürr', $from->name);
        self::assertSame('francois@example.test', $from->email);
        self::assertSame('2026-10-09T08:00:00+02:00', $headers->date()?->format(DateTimeInterface::RFC3339));
    }

    public function testAddressListsWithQuotedCommasAndEncodedNames(): void
    {
        $headers = new Headers($this->parser->parse(self::fixture('nested')));

        self::assertSame(['alice@example.test', 'john@example.test'], array_map(static fn ($a) => $a->email, $headers->addresses('To')));
        self::assertSame('Smith, John', $headers->addresses('To')[1]->name);
        self::assertSame('Zöë Bük', $headers->addresses('Cc')[0]->name);
    }

    public function testLatin1BodyIsConverted(): void
    {
        $message = $this->parser->parse(self::fixture('latin1'));

        self::assertStringContainsString('La réunion est prévue à 18h', (string) $message->getTextContent());
    }

    public function testUndeclaredUtf8IsKept(): void
    {
        $message = $this->parser->parse(self::fixture('undeclared-utf8'));

        self::assertStringContainsString('café, naïve, 日本語, emoji 🎉', (string) $message->getTextContent());
    }

    public function testMessageWithoutMimeHeaders(): void
    {
        $message = $this->parser->parse(self::fixture('no-content-type'));

        self::assertStringContainsString('This message predates MIME', (string) $message->getTextContent());
        self::assertNull($message->getHtmlContent());
    }

    public function testWrongWeekdayDoesNotShiftTheDate(): void
    {
        // 2026-10-09 is a Friday, PHP alone would answer the next Thursday
        $headers = $this->parser->parseHeaders("Date: Thu, 09 Oct 2026 08:00:00 +0200\r\n");

        self::assertSame('2026-10-09T08:00:00+02:00', $headers->date()?->format(DateTimeInterface::RFC3339));
    }

    public function testHeaderBlockOnly(): void
    {
        $headers = $this->parser->parseHeaders("From: Bob <bob@example.test>\r\nSubject: =?utf-8?B?SMOpIGzDoA==?=\r\nDate: Tue, 07 Oct 2026 18:30:00 +0200\r\n");

        self::assertSame('Hé là', $headers->subject());
        self::assertSame('Bob', $headers->from()?->name);
        self::assertSame('2026-10-07T18:30:00+02:00', $headers->date()?->format(DateTimeInterface::RFC3339));
    }
}
