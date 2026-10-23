<?php

declare(strict_types=1);

namespace App\Tests\Imap\Protocol;

use App\Imap\Protocol\Tokenizer;
use PHPUnit\Framework\TestCase;

final class TokenizerTest extends TestCase
{
    public function testAtomsQuotedAndNil(): void
    {
        self::assertSame(['*', 'OK', 'done', null, 'a b'], Tokenizer::parse('* OK done NIL "a b"'));
    }

    public function testNestedLists(): void
    {
        self::assertSame(
            ['*', '12', 'FETCH', ['UID', '12', 'FLAGS', ['\Seen', '\Flagged'], 'RFC822.SIZE', '546']],
            Tokenizer::parse('* 12 FETCH (UID 12 FLAGS (\Seen \Flagged) RFC822.SIZE 546)'),
        );
    }

    public function testQuotedEscapes(): void
    {
        self::assertSame(['say "hi" \\ bye'], Tokenizer::parse('"say \\"hi\\" \\\\ bye"'));
    }

    public function testLiteralIsTakenByByteCount(): void
    {
        $line = "* 1 FETCH (BODY[HEADER.FIELDS (SUBJECT)] {22}\r\nSubject: a (b) \"c\"\r\n\r\n FLAGS ())";
        $tokens = Tokenizer::parse($line);

        self::assertSame(['BODY[HEADER.FIELDS (SUBJECT)]', "Subject: a (b) \"c\"\r\n\r\n", 'FLAGS', []], $tokens[3]);
    }

    public function testSectionAtomKeepsItsBrackets(): void
    {
        self::assertSame(['BODY[1.2]', 'x', 'BODY[]', 'y'], Tokenizer::parse('BODY[1.2] "x" BODY[] "y"'));
    }

    public function testSortResponse(): void
    {
        self::assertSame(['*', 'SORT', '17167', '14491', '11952'], Tokenizer::parse('* SORT 17167 14491 11952'));
    }
}
