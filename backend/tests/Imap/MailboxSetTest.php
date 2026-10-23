<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\Mailbox;
use PHPUnit\Framework\TestCase;

final class MailboxSetTest extends TestCase
{
    public function testRunsBecomeRanges(): void
    {
        self::assertSame('1:3,5,7:8', Mailbox::set([8, 1, 2, 3, 5, 7, 2]));
        self::assertSame('42', Mailbox::set([42]));
        self::assertSame('', Mailbox::set([]));
    }
}
