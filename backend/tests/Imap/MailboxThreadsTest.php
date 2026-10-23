<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\Protocol\Tokenizer;
use PHPUnit\Framework\TestCase;

final class MailboxThreadsTest extends TestCase
{
    public function testThreadResponseShape(): void
    {
        // RFC 5256 example: the tree is nested lists, a thread can start with a list
        $tokens = Tokenizer::parse('* THREAD (2)(3 6 (4 23)(44 7 96))((11)(12))');

        self::assertSame(['*', 'THREAD', ['2'], ['3', '6', ['4', '23'], ['44', '7', '96']], [['11'], ['12']]], $tokens);
    }
}
