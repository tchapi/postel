<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\SearchCriteria;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class SearchCriteriaTest extends TestCase
{
    public function testNothingIsAll(): void
    {
        self::assertSame('ALL', SearchCriteria::build(null));
        self::assertSame('ALL', SearchCriteria::build('   '));
    }

    public function testFlagsAlone(): void
    {
        self::assertSame('UNSEEN FLAGGED', SearchCriteria::build('', true, true));
    }

    public function testTextSearchesHeadersOnly(): void
    {
        self::assertSame('OR OR FROM "bob" SUBJECT "bob" TO "bob"', SearchCriteria::build('bob'));
    }

    public function testAttachmentsAndDates(): void
    {
        self::assertSame(
            'HEADER Content-Type "multipart/mixed" SINCE 1-Oct-2026 BEFORE 23-Oct-2026',
            SearchCriteria::build('', attachments: true, since: new DateTimeImmutable('2026-10-01'), before: new DateTimeImmutable('2026-10-23')),
        );
    }

    public function testQuotesAreEscaped(): void
    {
        self::assertSame('UNSEEN OR OR FROM "a \"b\"" SUBJECT "a \"b\"" TO "a \"b\""', SearchCriteria::build('a "b"', true));
    }
}
