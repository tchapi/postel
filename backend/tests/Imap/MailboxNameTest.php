<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\MailboxName;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class MailboxNameTest extends TestCase
{
    #[DataProvider('names')]
    public function testDecode(string $encoded, string $expected): void
    {
        self::assertSame($expected, MailboxName::decode($encoded));
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function names(): iterable
    {
        yield 'ascii' => ['Archive', 'Archive'];
        yield 'ampersand' => ['Tom &- Jerry', 'Tom & Jerry'];
        yield 'precomposed' => ['Pr&AOk-', 'Pré'];
        yield 'combining mark' => ['Me&AwE-nilmontant', 'Ménilmontant'];
        yield 'curly apostrophe' => ['Rue de l&IBk-Indre', 'Rue de l’Indre'];
        yield 'base64 slash' => ['&ZeVnLIqe-', '日本語'];
        yield 'malformed' => ['&*-', '&*-'];
    }
}
