<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\FolderRole;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FolderRoleTest extends TestCase
{
    /**
     * @param list<string> $attributes
     */
    #[DataProvider('folders')]
    public function testDetect(string $path, array $attributes, ?FolderRole $expected): void
    {
        self::assertSame($expected, FolderRole::detect($path, $attributes));
    }

    /**
     * @return iterable<string, array{string, list<string>, ?FolderRole}>
     */
    public static function folders(): iterable
    {
        yield 'inbox is always the inbox' => ['INBOX', ['\HasNoChildren'], FolderRole::Inbox];
        yield 'special-use wins over the name' => ['Brouillons', ['\Drafts', '\HasNoChildren'], FolderRole::Drafts];
        yield 'special-use is case insensitive' => ['Sent', ['\SENT'], FolderRole::Sent];
        yield 'name fallback' => ['Spam', ['\HasNoChildren'], FolderRole::Junk];
        yield 'name fallback is case insensitive' => ['TRASH', [], FolderRole::Trash];
        yield 'custom folder has no role' => ['Receipts', ['\HasNoChildren'], null];
        yield 'nested folder is not matched by its leaf name' => ['INBOX.Sent', [], null];
    }
}
