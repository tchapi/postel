<?php

declare(strict_types=1);

namespace App\Tests\Mail;

use App\Mail\TextRenderer;
use PHPUnit\Framework\TestCase;

final class TextRendererTest extends TestCase
{
    public function testFlowedLinesAreJoined(): void
    {
        $text = "Hi Alice, \r\nthis paragraph is split \r\nover three lines.\r\n\r\n> quoted \r\n> and flowed.\r\n\r\n-- \r\nBob";

        self::assertSame(
            "Hi Alice, this paragraph is split over three lines.\n\n> quoted and flowed.\n\n--\nBob",
            TextRenderer::unflow($text),
        );
    }

    public function testDelSpRemovesTheSoftBreakSpace(): void
    {
        self::assertSame('ab', TextRenderer::unflow("a \nb", true));
        self::assertSame('a b', TextRenderer::unflow("a \nb", false));
    }

    public function testQuoteDepthChangeBreaksTheParagraph(): void
    {
        self::assertSame("> a\n>> b", TextRenderer::unflow("> a \n>> b"));
    }
}
