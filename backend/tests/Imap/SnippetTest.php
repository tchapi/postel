<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\MessageListService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SnippetTest extends TestCase
{
    #[DataProvider('previews')]
    public function testSnippet(string $preview, string $expected): void
    {
        self::assertSame($expected, MessageListService::snippet($preview));
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function previews(): iterable
    {
        yield 'plain' => ["Hello\r\n  world ", 'Hello world'];
        yield 'entities' => ['&nbsp;Si vous ne visualisez pas &eacute;l&#233;ment &amp; co', 'Si vous ne visualisez pas élément & co'];
        yield 'preheader padding' => ["Promo\u{200C}\u{00A0}\u{034F} \u{00AD}\u{FEFF}du jour", 'Promo du jour'];
        yield 'zwnj entity' => ['A&zwnj;&nbsp;&zwnj;B', 'A B'];
    }
}
