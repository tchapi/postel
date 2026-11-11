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
            ['name' => 'Zoë Dürr', 'email' => 'zoe@work.example', 'photo' => null],
            ['name' => 'Zoë Dürr', 'email' => 'zoe@home.example', 'photo' => null],
        ], VCard::addresses($card));
    }

    public function testFoldedLinesGroupsAndEscapes(): void
    {
        // Apple groups properties ("item1."), long lines fold with a leading space
        $card = "BEGIN:VCARD\nVERSION:4.0\nFN:Smith\\, Jane\nitem1.EMAIL;type=INTERNET:jane.smith@exa\n mple.test\nEND:VCARD\n";

        self::assertSame([['name' => 'Smith, Jane', 'email' => 'jane.smith@example.test', 'photo' => null]], VCard::addresses($card));
    }

    public function testNoNameAndInvalidAddresses(): void
    {
        $card = "BEGIN:VCARD\r\nVERSION:3.0\r\nEMAIL:mailto:solo@example.test\r\nEMAIL:not an address\r\nEND:VCARD\r\n";

        self::assertSame([['name' => null, 'email' => 'solo@example.test', 'photo' => null]], VCard::addresses($card));
    }

    public function testAnInlinePictureIsDecoded(): void
    {
        $png = "\x89PNG\r\n\x1a\n";
        // 3.0 style, folded over two lines
        $v3 = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pic\r\nPHOTO;ENCODING=b;TYPE=PNG:".substr(base64_encode($png), 0, 6)."\r\n ".substr(base64_encode($png), 6)."\r\nEMAIL:pic@example.test\r\nEND:VCARD\r\n";
        // 4.0 style, a data URL
        $v4 = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Pic\r\nPHOTO:data:image/png;base64,".base64_encode($png)."\r\nEMAIL:pic@example.test\r\nEND:VCARD\r\n";

        foreach ([$v3, $v4] as $card) {
            self::assertSame([['name' => 'Pic', 'email' => 'pic@example.test', 'photo' => ['mime' => 'image/png', 'data' => $png]]], VCard::addresses($card));
        }
    }

    public function testALinkedOrBrokenPictureIsLeftOut(): void
    {
        $linked = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Pic\r\nPHOTO;VALUE=uri:https://example.test/pic.jpg\r\nEMAIL:pic@example.test\r\nEND:VCARD\r\n";
        $broken = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pic\r\nPHOTO;ENCODING=b;TYPE=JPEG:not*base64*\r\nEMAIL:pic@example.test\r\nEND:VCARD\r\n";

        foreach ([$linked, $broken] as $card) {
            self::assertNull(VCard::addresses($card)[0]['photo']);
        }
    }
}
