<?php

declare(strict_types=1);

namespace App\Tests\Mail;

use App\Mail\HtmlRenderer;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class HtmlRendererTest extends KernelTestCase
{
    private HtmlRenderer $renderer;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->renderer = self::getContainer()->get(HtmlRenderer::class);
    }

    private static function xssFixture(): string
    {
        $raw = (string) file_get_contents(__DIR__.'/../Fixtures/mail/xss.eml');

        return substr($raw, (int) strpos($raw, '<html>'));
    }

    public function testEverythingActiveIsGone(): void
    {
        ['html' => $html, 'hasRemoteImages' => $remote] = $this->renderer->render(self::xssFixture(), static fn () => null, false);

        self::assertTrue($remote);
        foreach (['<script', 'onerror', 'javascript:', '<iframe', '<form', '<input', '<meta', '<svg', 'onload', 'tracker.evil.example', '<style', 'expression(', 'position:fixed'] as $needle) {
            self::assertStringNotContainsStringIgnoringCase($needle, $html, $needle.' survived');
        }
        self::assertStringContainsString('<a href="https://legit.example/login"', $html);
        self::assertStringContainsString('Overlay', $html);
    }

    public function testRemoteImagesStayWhenAsked(): void
    {
        ['html' => $html] = $this->renderer->render('<p><img src="https://img.example/a.png" alt="a"></p>', static fn () => null, true);

        self::assertStringContainsString('src="https://img.example/a.png"', $html);
    }

    public function testInlineImagesPointToTheirPart(): void
    {
        $resolver = static fn (string $cid) => 'pixel@shop.example' === $cid ? '/api/folders/INBOX/messages/7/parts/2' : null;
        ['html' => $html, 'hasRemoteImages' => $remote] = $this->renderer->render('<img src="cid:pixel@shop.example"><img src="cid:unknown">', $resolver, false);

        self::assertFalse($remote);
        self::assertStringContainsString('src="/api/folders/INBOX/messages/7/parts/2"', $html);
        self::assertStringNotContainsString('cid:', $html);
    }

    public function testInlineStylesAreKeptButDefanged(): void
    {
        ['html' => $html] = $this->renderer->render('<p style="color: red; background: url(http://x/y.png); font-weight: bold">x</p>', static fn () => null, false);

        self::assertStringContainsString('color: red', $html);
        self::assertStringContainsString('font-weight: bold', $html);
        self::assertStringNotContainsString('url(', $html);
    }

    public function testOutlookMarkupIsReducedToContent(): void
    {
        $raw = (string) file_get_contents(__DIR__.'/../Fixtures/mail/outlook-html.eml');
        $html = substr($raw, (int) strpos($raw, '<html'));
        ['html' => $out] = $this->renderer->render($html, static fn () => null, false);

        self::assertStringContainsString('Dear all,', $out);
        self::assertStringContainsString('<table', $out);
        self::assertStringNotContainsString('<o:p>', $out);
        self::assertStringNotContainsString('<xml', $out);
    }
}
