<?php

declare(strict_types=1);

namespace App\Tests\Imap\Protocol;

use App\Imap\Protocol\BodyStructure;
use App\Imap\Protocol\Tokenizer;
use PHPUnit\Framework\TestCase;

/**
 * BODYSTRUCTURE strings as Dovecot returns them for the fixture corpus.
 */
final class BodyStructureTest extends TestCase
{
    private static function parse(string $bodystructure): \App\Imap\Protocol\BodyPart
    {
        // The FETCH item value is the outer list itself
        $list = Tokenizer::parse($bodystructure)[0];
        self::assertIsArray($list);

        return BodyStructure::parse(array_values($list));
    }

    public function testPlainText(): void
    {
        $part = self::parse('("text" "plain" ("charset" "utf-8" "format" "flowed") NIL NIL "8bit" 240 8 NIL NIL NIL NIL)');

        self::assertSame('1', $part->section);
        self::assertSame('text/plain', $part->mimeType());
        self::assertSame(['charset' => 'utf-8', 'format' => 'flowed'], $part->parameters);
        self::assertSame('8bit', $part->encoding);
        self::assertSame(240, $part->size);
        self::assertFalse($part->isAttachment());
        self::assertSame([], $part->attachments());
    }

    public function testRelatedWithInlineImage(): void
    {
        $part = self::parse('(("text" "html" ("charset" "utf-8") NIL NIL "7bit" 134 2 NIL NIL NIL NIL)("image" "png" ("name" "pixel.png") "<pixel@shop.example>" NIL "base64" 96 NIL ("inline" ("filename" "pixel.png")) NIL NIL) "related" ("boundary" "rel" "type" "text/html") NIL NIL NIL)');

        self::assertTrue($part->isMultipart());
        self::assertSame('related', $part->subtype);
        self::assertCount(2, $part->children);
        self::assertSame('1', $part->children[0]->section);
        self::assertSame('2', $part->children[1]->section);

        $image = $part->findByContentId('pixel@shop.example');
        self::assertNotNull($image);
        self::assertSame('2', $image->section);
        self::assertTrue($image->isInline());
        self::assertFalse($image->isAttachment());
        self::assertSame('pixel.png', $image->filename());
        self::assertSame([], $part->attachments());
    }

    public function testNestedMixedAlternativeRelated(): void
    {
        $part = self::parse('((("text" "plain" ("charset" "utf-8") NIL NIL "7bit" 61 1 NIL NIL NIL NIL)(("text" "html" ("charset" "utf-8") NIL NIL "7bit" 82 1 NIL NIL NIL NIL)("image" "png" NIL "<logo@erin>" NIL "base64" 96 NIL ("inline" ("filename" "logo.png")) NIL NIL) "related" ("boundary" "rel") NIL NIL NIL) "alternative" ("boundary" "alt") NIL NIL NIL)("application" "pdf" ("name" "report.pdf") NIL NIL "base64" 112 NIL ("attachment" ("filename" "report.pdf")) NIL NIL)("text" "csv" ("name" "numbers.csv") NIL NIL "7bit" 12 2 NIL ("attachment" ("filename" "numbers.csv")) NIL NIL) "mixed" ("boundary" "mixed") NIL NIL NIL)');

        $sections = array_map(static fn ($p) => $p->section, $part->flatten());
        self::assertSame(['', '1', '1.1', '1.2', '1.2.1', '1.2.2', '2', '3'], $sections);

        $attachments = $part->attachments();
        self::assertSame(['2', '3'], array_map(static fn ($p) => $p->section, $attachments));
        self::assertSame('report.pdf', $attachments[0]->filename());
        self::assertSame('application/pdf', $attachments[0]->mimeType());
        self::assertSame('1.2.2', $part->findByContentId('<logo@erin>')?->section);
    }

    public function testCalendarPartIsNotAnAttachment(): void
    {
        $part = self::parse('(("text" "plain" ("charset" "utf-8") NIL NIL "7bit" 25 1 NIL NIL NIL NIL)("text" "calendar" ("charset" "utf-8" "method" "REQUEST") NIL NIL "7bit" 342 17 NIL NIL NIL NIL) "alternative" ("boundary" "alt") NIL NIL NIL)');

        self::assertSame([], $part->attachments());
    }

    public function testEncodedFilenameIsDecoded(): void
    {
        $part = self::parse('("application" "octet-stream" ("name" "=?utf-8?Q?r=C3=A9sum=C3=A9.bin?=") NIL NIL "base64" 10 NIL ("attachment" ("filename" "=?utf-8?Q?r=C3=A9sum=C3=A9.bin?=")) NIL NIL)');

        self::assertSame('résumé.bin', $part->filename());
    }
}
