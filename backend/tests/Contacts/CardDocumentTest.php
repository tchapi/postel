<?php

declare(strict_types=1);

namespace App\Tests\Contacts;

use App\Contacts\CardDocument;
use App\Contacts\InvalidCard;
use App\Contacts\Request\AddressInput;
use App\Contacts\Request\CardInput;
use App\Contacts\Request\EmailInput;
use App\Contacts\Request\PhoneInput;
use App\Contacts\Request\UrlInput;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

use function array_slice;
use function count;
use function is_int;
use function is_string;
use function sprintf;

/**
 * The editor sends back the model it was given, with the user's changes:
 * these tests do the same and look at the lines that come out.
 */
final class CardDocumentTest extends TestCase
{
    private const string FIXTURES = __DIR__.'/../Fixtures/vcard/';

    /**
     * @return iterable<string, array{string}>
     */
    public static function fixtures(): iterable
    {
        foreach (glob(self::FIXTURES.'*.vcf') ?: [] as $file) {
            yield basename($file) => [basename($file)];
        }
    }

    #[DataProvider('fixtures')]
    public function testSavingWithoutChangesKeepsEveryLine(string $fixture): void
    {
        $card = self::read($fixture);
        $before = self::lines((string) file_get_contents(self::FIXTURES.$fixture));

        $card->apply(self::input($card->toArray()));

        self::assertSame(self::without($before, 'REV'), self::without(self::lines($card->toString()), 'REV'));
    }

    #[DataProvider('fixtures')]
    public function testEditingTheTitleLeavesTheRestAlone(string $fixture): void
    {
        $card = self::read($fixture);
        $before = self::lines((string) file_get_contents(self::FIXTURES.$fixture));

        $card->apply(self::input($card->toArray(), ['title' => 'Captain']));

        $after = self::lines($card->toString());
        self::assertContains('TITLE:Captain', $after);
        self::assertSame(self::without($before, 'REV', 'TITLE'), self::without($after, 'REV', 'TITLE'));
    }

    public function testUnknownPropertiesComeOutAsTheyWentIn(): void
    {
        $card = self::read('unknown-properties.vcf');

        $card->apply(self::input($card->toArray(), ['note' => 'New note']));

        $out = $card->toString();
        foreach ([
            'X-FOO;X-BAR="a,b";X-BAZ=c:weird\,value;with parts',
            'X-EMPTY:',
            'NICKNAME:Oddy,Od',
            'CATEGORIES:friends,work',
            'GEO:48.85;2.35',
            'PHOTO;VALUE=URI:https://example.test/pic.jpg',
        ] as $line) {
            self::assertStringContainsString($line."\r\n", self::unfold($out));
        }
    }

    public function testAppleGroupsAndLabelsSurviveAnEdit(): void
    {
        $card = self::read('apple-grouped.vcf');
        $model = $card->toArray();
        self::assertSame('Other', $model['emails'][0]['label']);
        self::assertSame('Boat', $model['phones'][0]['label']);

        $card->apply(self::input($model, ['emails' => [['key' => 0, 'value' => 'grace@new.example', 'type' => 'other']]]));

        $out = self::unfold($card->toString());
        // Updated in place: same group, same parameters, its label still next to it
        self::assertStringContainsString("item1.EMAIL;TYPE=INTERNET,pref:grace@new.example\r\n", $out);
        // Lines nobody edited come out exactly as they went in
        self::assertStringContainsString('item1.X-ABLabel:_$!<Other>!$_'."\r\n", $out);
        self::assertStringContainsString("item3.ADR;type=HOME;type=pref:;;1 quai du Port;Marseille;;13002;France\r\nitem3.X-ABADR:fr\r\n", $out);
        self::assertStringContainsString("X-SOCIALPROFILE;type=mastodon:https://social.example/@grace\r\n", $out);
        self::assertStringContainsString("IMPP;X-SERVICE-TYPE=Jabber;type=HOME:xmpp:grace@chat.example\r\n", $out);
    }

    public function testARowWithAKeyIsUpdatedWithoutOneAddedAndAMissingKeyRemoved(): void
    {
        $card = self::read('apple-grouped.vcf');
        $model = $card->toArray();

        $card->apply(self::input($model, [
            // The boat phone (key 0) is dropped, a new one comes in
            'phones' => [['value' => '+33 7 00 00 00 09', 'type' => 'cell']],
            'urls' => [['key' => 0, 'value' => 'https://grace.example/new'], ['value' => 'https://other.example/a,b']],
        ]));

        $out = self::unfold($card->toString());
        self::assertStringNotContainsString('+33 6 00 00 00 04', $out);
        // The removed phone takes its label with it, the email's label stays
        self::assertStringNotContainsString('Boat', $out);
        self::assertStringContainsString('item1.X-ABLabel', $out);
        self::assertStringContainsString("TEL;TYPE=CELL:+33 7 00 00 00 09\r\n", $out);
        self::assertStringContainsString("item4.URL;TYPE=pref:https://grace.example/new\r\n", $out);
        self::assertStringContainsString('item4.X-ABLabel:_$!<HomePage>!$_'."\r\n", $out);
        self::assertStringContainsString("URL:https://other.example/a,b\r\n", $out);
    }

    public function testAnAddressKeepsItsPostOfficeBox(): void
    {
        $card = self::read('plain-3.0.vcf');
        $model = $card->toArray();
        self::assertSame(['key' => 0, 'type' => 'home', 'street' => '12 rue des Lilas', 'city' => 'Lyon', 'region' => '', 'postalCode' => '69001', 'country' => 'France'], $model['addresses'][0]);

        $address = ['key' => 0, 'type' => 'home', 'street' => '14 rue des Lilas', 'city' => 'Lyon', 'region' => '', 'postalCode' => '69001', 'country' => 'France'];
        $card->apply(self::input($model, ['addresses' => [$address, ['type' => 'work', 'street' => '1 place Bellecour', 'city' => 'Lyon']]]));

        $out = self::unfold($card->toString());
        self::assertStringContainsString("ADR;TYPE=HOME:BP 12;Bât. B;14 rue des Lilas;Lyon;;69001;France\r\n", $out);
        self::assertStringContainsString("ADR;TYPE=WORK:;;1 place Bellecour;Lyon;;;\r\n", $out);
    }

    public function testTheNameIsRecomputedOnlyWhenNamesOrOrganisationChange(): void
    {
        $card = self::read('plain-3.0.vcf');
        // FN is not "first last" on purpose: an unrelated edit must not rewrite it
        $card->apply(self::input($card->toArray(), ['note' => 'Hello']));
        self::assertStringContainsString("FN:Émile Durand\r\n", $card->toString());

        $card->apply(self::input($card->toArray(), ['firstName' => 'Émilie']));

        $out = $card->toString();
        self::assertStringContainsString("FN:Émilie Durand\r\n", $out);
        // Additional names, prefix and suffix are kept
        self::assertStringContainsString("N:Durand;Émilie;Jean;Dr;Jr\r\n", $out);
        // The department after the organisation is kept too
        self::assertStringContainsString("ORG:Example;Research\r\n", $out);
    }

    public function testWithoutNamesTheOrganisationThenTheEmailNameTheCard(): void
    {
        $card = self::read('plain-3.0.vcf');
        $card->apply(self::input($card->toArray(), ['firstName' => null, 'lastName' => null]));
        self::assertSame('Example', $card->toArray()['name']);

        $card->apply(self::input($card->toArray(), ['org' => null]));
        self::assertSame('emile@example.test', $card->toArray()['name']);
        self::assertStringContainsString("ORG:;Research\r\n", $card->toString());
    }

    public function testTypesReadAsFourWordsAndOnlyTheTypeIsRewritten(): void
    {
        $card = self::read('plain-3.0.vcf');
        $model = $card->toArray();
        self::assertSame(['work', 'home'], array_column($model['emails'], 'type'));
        self::assertSame(['cell', 'work'], array_column($model['phones'], 'type'));
        self::assertSame('cell', self::read('version-4.0.vcf')->toArray()['phones'][0]['type']);

        $emails = $model['emails'];
        $emails[1]['type'] = 'work';
        $phones = $model['phones'];
        $phones[0]['type'] = 'other';
        $card->apply(self::input($model, ['emails' => $emails, 'phones' => $phones]));

        $out = self::unfold($card->toString());
        // INTERNET, PREF and VOICE are not the app's business and stay
        self::assertStringContainsString("EMAIL;TYPE=INTERNET,PREF,WORK:emile@home.example\r\n", $out);
        self::assertStringContainsString("TEL;TYPE=VOICE:+33 6 00 00 00 01\r\n", $out);
        self::assertStringContainsString("EMAIL;TYPE=INTERNET;TYPE=WORK:emile@example.test\r\n", $out);
    }

    public function testRevisionIsSetAndUidKept(): void
    {
        $card = self::read('plain-3.0.vcf');
        $card->apply(self::input($card->toArray(), ['title' => 'Boss']));

        $out = $card->toString();
        self::assertStringContainsString("UID:plain-30\r\n", $out);
        self::assertStringNotContainsString('REV:2020', $out);
        self::assertMatchesRegularExpression('/^REV:'.gmdate('Ymd').'T\d{6}Z\r$/m', $out);
    }

    public function testABlankCardIsVersion3WithAUid(): void
    {
        $card = CardDocument::blank('new-uid');
        $card->apply(self::input(['emails' => [], 'phones' => [], 'addresses' => [], 'urls' => []], ['emails' => [['value' => 'solo@example.test', 'type' => 'home']]]));

        $lines = self::lines($card->toString());
        self::assertSame('VERSION:3.0', $lines[1]);
        self::assertContains('UID:new-uid', $lines);
        self::assertContains('PRODID:-//Postel//Postel//EN', $lines);
        self::assertContains('EMAIL;TYPE=HOME:solo@example.test', $lines);
        // Only an address to go by: it names the card
        self::assertContains('FN:solo@example.test', $lines);
        self::assertSame('new-uid', $card->uid());
    }

    public function testThePictureIsWrittenTheWayEachVersionWantsIt(): void
    {
        $jpeg = "\xFF\xD8\xFF\xE0fake";

        $v3 = self::read('photo-3.0.vcf');
        $v3->setPhoto($jpeg);
        self::assertStringContainsString('PHOTO;ENCODING=b;TYPE=JPEG:'.base64_encode($jpeg)."\r\n", $v3->toString());
        self::assertSame(['mime' => 'image/jpeg', 'data' => $jpeg], $v3->photo());

        $v4 = self::read('photo-4.0.vcf');
        $v4->setPhoto($jpeg);
        self::assertStringContainsString('PHOTO:data:image/jpeg;base64,'.base64_encode($jpeg)."\r\n", $v4->toString());
        self::assertSame(['mime' => 'image/jpeg', 'data' => $jpeg], $v4->photo());

        $v4->removePhoto();
        self::assertNull($v4->photo());
        self::assertStringNotContainsString('PHOTO', $v4->toString());
    }

    public function testThePictureIsReadInEveryEncoding(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAC0lEQVQImWNgQAYAAA4AAbGa6gYAAAAASUVORK5CYII=', true);
        foreach (['photo-3.0.vcf', 'photo-4.0.vcf', 'photo-2.1.vcf'] as $fixture) {
            $card = self::read($fixture);
            self::assertSame(['mime' => 'image/png', 'data' => $png], $card->photo(), $fixture);
            self::assertTrue($card->toArray()['photo']);
        }
        // A link is not a picture the app can serve
        self::assertNull(self::read('unknown-properties.vcf')->photo());
    }

    public function testA4PictureAndALinkWithACommaAreNotMangled(): void
    {
        $card = self::read('version-4.0.vcf');
        $card->apply(self::input($card->toArray(), ['title' => 'Chef']));
        self::assertStringContainsString("URL:https://example.test/a,b\r\n", $card->toString());

        $photo = self::read('photo-4.0.vcf');
        $before = self::unfold($photo->toString());
        $photo->apply(self::input($photo->toArray(), ['title' => 'Chef']));
        self::assertStringContainsString('PHOTO:data:image/png;base64,iVBOR', $before);
        self::assertStringContainsString('PHOTO:data:image/png;base64,iVBOR', self::unfold($photo->toString()));
    }

    public function testABirthdayWithoutAYearIsReadAsSuchAndLeftAlone(): void
    {
        $apple = self::read('apple-grouped.vcf');
        self::assertSame('--11-02', $apple->toArray()['birthday']);
        $apple->apply(self::input($apple->toArray(), ['title' => 'Skipper']));
        self::assertStringContainsString("BDAY;X-APPLE-OMIT-YEAR=1604:1604-11-02\r\n", $apple->toString());

        $v4 = self::read('version-4.0.vcf');
        self::assertSame('--07-04', $v4->toArray()['birthday']);
        $v4->apply(self::input($v4->toArray(), ['birthday' => '1990-07-04']));
        self::assertStringContainsString("BDAY:19900704\r\n", $v4->toString());

        $apple->apply(self::input($apple->toArray(), ['birthday' => '1990-11-02']));
        self::assertStringContainsString("BDAY:1990-11-02\r\n", $apple->toString());
        self::assertSame('1984-03-12', self::read('plain-3.0.vcf')->toArray()['birthday']);
    }

    public function testAFoldedEscapedNoteReadsAsText(): void
    {
        $card = self::read('folded-note.vcf');

        self::assertSame("First line\nsecond line, with a comma; and a semicolon. This note is long enough to be folded over two lines.", $card->toArray()['note']);
    }

    public function testTheModelOfACard(): void
    {
        self::assertSame([
            'name' => 'Noémie Roux',
            'firstName' => 'Noémie',
            'lastName' => 'Roux',
            'org' => null,
            'title' => null,
            'emails' => [['key' => 0, 'value' => 'noemie@work.example', 'type' => 'work', 'label' => null]],
            'phones' => [['key' => 0, 'value' => '+33-6-00-00-00-03', 'type' => 'cell', 'label' => null]],
            'addresses' => [],
            'urls' => [['key' => 0, 'value' => 'https://example.test/a,b']],
            'birthday' => '--07-04',
            'note' => null,
            'photo' => false,
        ], self::read('version-4.0.vcf')->toArray());

        self::assertSame(
            ['name' => 'Plumber', 'org' => 'Fix-It', 'emails' => [], 'phones' => ['+33 4 00 00 00 02'], 'hasPhoto' => false],
            self::read('no-email.vcf')->summary(),
        );
    }

    public function testAFileIsCutIntoCards(): void
    {
        $file = "\xEF\xBB\xBF".implode('', array_map(static fn (string $f) => (string) file_get_contents(self::FIXTURES.$f), ['plain-3.0.vcf', 'no-email.vcf']))
            ."BEGIN:VCARD\nVERSION:3.0\nFN:Broken\nEND:VCARD\nnoise between cards\nBEGIN:VCARD\nFN:Cut short\n";

        $cards = CardDocument::splitAll($file);

        self::assertCount(3, $cards);
        self::assertSame('no-email', CardDocument::fromString($cards[1])->uid());
        self::assertSame("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Broken\r\nEND:VCARD\r\n", $cards[2]);
    }

    public function testAnImportedCardCanGetANewUid(): void
    {
        $card = self::read('plain-3.0.vcf');

        $card->replaceUid('fresh');

        self::assertSame('fresh', $card->uid());
        self::assertSame(1, substr_count($card->toString(), 'UID:'));
    }

    public function testSomethingElseIsNotACard(): void
    {
        $this->expectException(InvalidCard::class);

        CardDocument::fromString("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    }

    public function testTheNameWrittenByHandStaysWhenOnlyTheOrganisationChanges(): void
    {
        $card = CardDocument::fromString("BEGIN:VCARD\r\nVERSION:3.0\r\nUID:x\r\nFN:Dr Bob Martin Jr\r\nN:Martin;Bob;;;\r\nORG:Old\r\nEND:VCARD\r\n");

        $card->apply(self::input($card->toArray(), ['org' => 'New']));
        self::assertSame('Dr Bob Martin Jr', $card->toArray()['name']);

        $card->apply(self::input($card->toArray(), ['firstName' => 'Robert']));
        self::assertSame('Robert Martin', $card->toArray()['name']);
    }

    public function testACardNamedAfterItsOrganisationFollowsIt(): void
    {
        $card = CardDocument::fromString("BEGIN:VCARD\r\nVERSION:3.0\r\nUID:x\r\nFN:Old\r\nN:;;;;\r\nORG:Old\r\nEND:VCARD\r\n");

        $card->apply(self::input($card->toArray(), ['org' => 'New']));

        self::assertSame('New', $card->toArray()['name']);
    }

    public function testMergingAddsWhatIsMissingAndReplacesNothing(): void
    {
        $card = self::read('plain-3.0.vcf');
        $before = self::lines($card->toString());
        $other = CardDocument::fromString(implode("\r\n", [
            'BEGIN:VCARD', 'VERSION:3.0', 'UID:other', 'FN:E. Durand', 'N:Durand;E.;;;', 'ORG:Elsewhere', 'NICKNAME:Mimile',
            'EMAIL;TYPE=HOME:EMILE@example.test', 'EMAIL;TYPE=WORK:emile@other.example',
            'TEL;TYPE=CELL:+33600000001', 'TEL;TYPE=HOME:+33 4 00 00 00 09',
            'ADR;TYPE=WORK:;;12 Rue des Lilas;lyon;;69001;France', 'ADR;TYPE=WORK:;;1 place Bellecour;Lyon;;69002;France',
            'URL:https://example.test/emile', 'URL:https://other.example',
            'BDAY:1990-01-01', 'NOTE:Met in Lyon', 'X-CUSTOM;X-PARAM=a:one;two', 'REV:2021-01-01T00:00:00Z', 'END:VCARD', '',
        ]));

        $card->absorb($other);

        $after = self::lines($card->toString());
        $kept = self::without($before, 'REV', 'END');
        self::assertSame($kept, array_slice($after, 0, count($kept)), 'every line of the card is still there, in place');
        self::assertSame([
            'NICKNAME:Mimile',
            'EMAIL;TYPE=WORK:emile@other.example',
            'TEL;TYPE=HOME:+33 4 00 00 00 09',
            'ADR;TYPE=WORK:;;1 place Bellecour;Lyon;;69002;France',
            'URL:https://other.example',
            'X-CUSTOM;X-PARAM=a:one;two',
            'NOTE:Met in Lyon',
        ], array_values(array_diff(self::without($after, 'REV', 'END'), $before)));
        self::assertSame('plain-30', $card->uid());
        self::assertSame('Émile Durand', $card->toArray()['name']);
        self::assertSame('1984-03-12', $card->toArray()['birthday']);
    }

    public function testMergingFillsAnEmptyNameAndJoinsTwoNotes(): void
    {
        $card = CardDocument::fromString("BEGIN:VCARD\r\nVERSION:3.0\r\nUID:x\r\nFN:\r\nN:;;;;\r\nEMAIL:bob@example.test\r\nNOTE:First note\r\nEND:VCARD\r\n");
        $other = CardDocument::fromString("BEGIN:VCARD\r\nVERSION:3.0\r\nUID:y\r\nFN:Bob Martin\r\nN:Martin;Bob;;;\r\nEMAIL:bob@example.test\r\nNOTE:Second note\r\nEND:VCARD\r\n");

        $card->absorb($other);
        $card->absorb($other);

        $model = $card->toArray();
        self::assertSame(['Bob Martin', 'Bob', 'Martin'], [$model['name'], $model['firstName'], $model['lastName']]);
        self::assertSame("First note\n\nSecond note", $model['note'], 'merged twice, the note is there once');
        self::assertCount(1, $model['emails']);
        self::assertSame(1, substr_count($card->toString(), "\r\nN:"));
        self::assertSame(1, substr_count($card->toString(), "\r\nFN:"));
    }

    public function testMergingBringsAppleGroupsAlongUnderFreeNames(): void
    {
        $card = self::read('apple-grouped.vcf');
        $before = self::lines($card->toString());
        $other = CardDocument::fromString(implode("\r\n", [
            'BEGIN:VCARD', 'VERSION:3.0', 'UID:other', 'FN:Grace M.', 'N:M.;Grace;;;',
            'item1.EMAIL;type=INTERNET:grace@boat.example', 'item1.X-ABLabel:Boat',
            'item2.EMAIL;type=INTERNET:GRACE@example.test', 'item2.X-ABLabel:Old',
            'item3.X-ABDATE:2020-06-01', 'item3.X-ABLabel:_$!<Anniversary>!$_',
            'IMPP;X-SERVICE-TYPE=Jabber;type=HOME:xmpp:grace@chat.example',
            'X-SOCIALPROFILE;type=twitter:https://twitter.example/grace',
            'END:VCARD', '',
        ]));

        $card->absorb($other);

        $after = self::lines($card->toString());
        self::assertSame([
            'item5.EMAIL;type=INTERNET:grace@boat.example',
            'item5.X-ABLabel:Boat',
            'item6.X-ABDATE:2020-06-01',
            'item6.X-ABLabel:_$!<Anniversary>!$_',
            'X-SOCIALPROFILE;type=twitter:https://twitter.example/grace',
        ], array_values(array_diff(self::without($after, 'REV', 'END'), $before)));
        $emails = $card->toArray()['emails'];
        self::assertSame(['Other', 'Boat'], array_column($emails, 'label'));
    }

    public function testMergingACardOfAnotherVersionConvertsIt(): void
    {
        $card = self::read('plain-3.0.vcf');

        $card->absorb(self::read('version-4.0.vcf'));

        $model = $card->toArray();
        self::assertContains('noemie@work.example', array_column($model['emails'], 'value'));
        self::assertContains('https://example.test/a,b', array_column($model['urls'], 'value'));
        self::assertStringContainsString("VERSION:3.0\r\n", $card->toString());
        self::assertSame('1984-03-12', $model['birthday']);
        // Still a card the reader takes back
        self::assertSame($model['emails'], CardDocument::fromString($card->toString())->toArray()['emails']);
    }

    private static function read(string $fixture): CardDocument
    {
        return CardDocument::fromString((string) file_get_contents(self::FIXTURES.$fixture));
    }

    /**
     * What the editor would send for this model, with some fields changed.
     *
     * @param array<string, mixed> $model
     * @param array<string, mixed> $changes
     */
    private static function input(array $model, array $changes = []): CardInput
    {
        $data = array_merge($model, $changes);
        $string = static fn (string $key): ?string => isset($data[$key]) && is_string($data[$key]) ? $data[$key] : null;
        $rows = static function (string $key) use ($data): array {
            $rows = $data[$key] ?? [];
            self::assertIsArray($rows);

            return array_values(array_map(static function ($row): array {
                self::assertIsArray($row);

                return $row;
            }, $rows));
        };

        return new CardInput(
            firstName: $string('firstName'),
            lastName: $string('lastName'),
            org: $string('org'),
            title: $string('title'),
            emails: array_map(static fn (array $r) => new EmailInput((string) $r['value'], (string) ($r['type'] ?? 'other'), self::key($r)), $rows('emails')),
            phones: array_map(static fn (array $r) => new PhoneInput((string) $r['value'], (string) ($r['type'] ?? 'other'), self::key($r)), $rows('phones')),
            addresses: array_map(static fn (array $r) => new AddressInput(
                (string) ($r['type'] ?? 'other'),
                (string) ($r['street'] ?? ''),
                (string) ($r['city'] ?? ''),
                (string) ($r['region'] ?? ''),
                (string) ($r['postalCode'] ?? ''),
                (string) ($r['country'] ?? ''),
                self::key($r),
            ), $rows('addresses')),
            urls: array_map(static fn (array $r) => new UrlInput((string) $r['value'], self::key($r)), $rows('urls')),
            birthday: $string('birthday'),
            note: $string('note'),
        );
    }

    /**
     * @param array<mixed> $row
     */
    private static function key(array $row): ?int
    {
        return isset($row['key']) && is_int($row['key']) ? $row['key'] : null;
    }

    /**
     * @return list<string>
     */
    private static function lines(string $card): array
    {
        return explode("\r\n", rtrim(self::unfold($card)));
    }

    private static function unfold(string $card): string
    {
        return str_replace("\r\n ", '', $card);
    }

    /**
     * @param list<string> $lines
     *
     * @return list<string>
     */
    private static function without(array $lines, string ...$names): array
    {
        return array_values(array_filter($lines, static function (string $line) use ($names): bool {
            foreach ($names as $name) {
                if (1 === preg_match(sprintf('/^(?:[^.:;]+\.)?%s[;:]/i', preg_quote($name, '/')), $line)) {
                    return false;
                }
            }

            return true;
        }));
    }
}
