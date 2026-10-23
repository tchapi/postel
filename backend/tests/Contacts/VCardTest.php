<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Contacts\VCard;
use PHPUnit\Framework\TestCase;

final class VCardTest extends TestCase
{
    public function testOneEntryPerAddress(): void
    {
        $card = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Zoë Dürr\r\nEMAIL;TYPE=work:zoe@work.example\r\nEMAIL;TYPE=home:Zoe@Home.example\r\nEND:VCARD\r\n";

        self::assertSame([
            ['name' => 'Zoë Dürr', 'email' => 'zoe@work.example'],
            ['name' => 'Zoë Dürr', 'email' => 'zoe@home.example'],
        ], VCard::addresses($card));
    }

    public function testFoldedLinesGroupsAndEscapes(): void
    {
        // Apple groups properties ("item1."), long lines fold with a leading space
        $card = "BEGIN:VCARD\nVERSION:4.0\nFN:Smith\\, Jane\nitem1.EMAIL;type=INTERNET:jane.smith@exa\n mple.test\nEND:VCARD\n";

        self::assertSame([['name' => 'Smith, Jane', 'email' => 'jane.smith@example.test']], VCard::addresses($card));
    }

    public function testNoNameAndInvalidAddresses(): void
    {
        $card = "BEGIN:VCARD\r\nVERSION:3.0\r\nEMAIL:mailto:solo@example.test\r\nEMAIL:not an address\r\nEND:VCARD\r\n";

        self::assertSame([['name' => null, 'email' => 'solo@example.test']], VCard::addresses($card));
    }
}
