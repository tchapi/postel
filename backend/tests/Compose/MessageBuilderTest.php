<?php

declare(strict_types=1);

namespace App\Tests\Compose;

use App\Compose\MessageBuilder;
use PHPUnit\Framework\TestCase;

final class MessageBuilderTest extends TestCase
{
    public function testHtmlToText(): void
    {
        $html = '<p>Hello <b>Bob</b>,</p><p>See &amp; tell.</p><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote>';

        self::assertSame("Hello Bob,\n\nSee & tell.\n\none\ntwo\n\n> quoted", MessageBuilder::toText($html));
    }
}
