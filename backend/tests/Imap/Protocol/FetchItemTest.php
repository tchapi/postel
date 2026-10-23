<?php

declare(strict_types=1);

namespace App\Tests\Imap\Protocol;

use App\Imap\Protocol\FetchItem;
use App\Imap\Protocol\Tokenizer;
use PHPUnit\Framework\TestCase;

final class FetchItemTest extends TestCase
{
    public function testItemsAreReadByName(): void
    {
        $item = FetchItem::fromTokens(Tokenizer::parse(
            "* 2011 FETCH (UID 2011 FLAGS (\\Seen) INTERNALDATE \"23-Oct-2026 07:36:07 +0000\" RFC822.SIZE 546 PREVIEW \"Hi Alice\" BODY[HEADER.FIELDS (FROM SUBJECT)] {46}\r\nFrom: Bob <bob@example.test>\r\nSubject: Hey\r\n\r\n)",
        ));

        self::assertSame(2011, $item->uid());
        self::assertSame(['\Seen'], $item->flags());
        self::assertSame('546', $item->string('RFC822.SIZE'));
        self::assertSame('Hi Alice', $item->string('PREVIEW'));
        self::assertSame("From: Bob <bob@example.test>\r\nSubject: Hey\r\n\r\n", $item->section('HEADER.FIELDS (FROM SUBJECT)'));
        self::assertSame("From: Bob <bob@example.test>\r\nSubject: Hey\r\n\r\n", $item->section('header.fields (from subject)'));
        self::assertNull($item->section('1'));
    }

    public function testFullBodySection(): void
    {
        $item = FetchItem::fromTokens(Tokenizer::parse("* 1 FETCH (UID 1 BODY[] {3}\r\nabc)"));

        self::assertSame('abc', $item->section(''));
    }
}
