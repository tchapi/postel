<?php

declare(strict_types=1);

namespace App\Tests\Imap;

use App\Imap\SearchCriteria;
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

    public function testQuotesAreEscaped(): void
    {
        self::assertSame('UNSEEN OR OR FROM "a \"b\"" SUBJECT "a \"b\"" TO "a \"b\""', SearchCriteria::build('a "b"', true));
    }
}
