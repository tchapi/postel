<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Contacts\Request\AddressInput;
use App\Contacts\Request\CardInput;
use App\Contacts\Request\EmailInput;
use App\Contacts\Request\PhoneInput;
use App\Contacts\Request\UrlInput;
use Sabre\VObject\Component\VCard as VCardComponent;
use Sabre\VObject\Parameter;
use Sabre\VObject\Property;
use Sabre\VObject\Property\Binary;
use Sabre\VObject\Property\Uri;
use Throwable;
use WeakMap;

use function array_slice;
use function in_array;
use function is_array;
use function is_string;

use const PHP_INT_MAX;
use const SORT_ASC;
use const SORT_NUMERIC;

/**
 * One vCard, read and edited with sabre/vobject. Only what the address book
 * shows is touched: every other property, parameter and Apple "itemN." group
 * is written back as it was read, in vCard 3.0 or 4.0.
 *
 * Emails, phones, addresses and links carry a `key`, their position among
 * the properties of the same name, so an edit lands on the line it came from.
 *
 * @phpstan-type Model array{
 *     firstName: ?string, lastName: ?string, name: ?string, org: ?string, title: ?string,
 *     emails: list<array{key: int, value: string, type: string, label: ?string}>,
 *     phones: list<array{key: int, value: string, type: string, label: ?string}>,
 *     addresses: list<array{key: int, type: string, street: string, city: string, region: string, postalCode: string, country: string}>,
 *     urls: list<array{key: int, value: string}>,
 *     birthday: ?string, note: ?string, photo: bool
 * }
 * @phpstan-type Summary array{name: ?string, org: ?string, emails: list<string>, phones: list<string>, hasPhoto: bool}
 */
final class CardDocument
{
    private const string PRODID = '-//Postel//Postel//EN';

    /** The types the address book knows, in the order they win when a line has several */
    private const array PHONE_TYPES = ['cell', 'work', 'home'];
    private const array PLACE_TYPES = ['work', 'home'];

    /** Properties shown as lists: removing one also removes its group, not these */
    private const array LISTS = ['EMAIL', 'TEL', 'ADR', 'URL'];

    /**
     * Each line read from the server, as vobject would write it back right
     * after reading: a line that still writes the same was not edited.
     *
     * @var WeakMap<Property, string>
     */
    private WeakMap $read;

    private function __construct(private readonly VCardComponent $card)
    {
        /** @var WeakMap<Property, string> $read */
        $read = new WeakMap();
        $this->read = $read;
        foreach ($card->children() as $child) {
            if (!$child instanceof Property || !isset($child->lineString)) {
                continue;
            }
            // Quoted-printable values (vCard 2.1) span several lines, the parser only keeps the first
            $encoding = $child->parameters['ENCODING'] ?? null;
            if (null !== $encoding && 'QUOTED-PRINTABLE' === strtoupper((string) $encoding->getValue())) {
                continue;
            }
            $this->read[$child] = $child->serialize();
        }
    }

    /**
     * @throws InvalidCard
     */
    public static function fromString(string $data): self
    {
        try {
            $card = (new CardParser())->parse($data, CardParser::OPTION_FORGIVING);
        } catch (Throwable $e) {
            // The parser throws many kinds of errors on bad input, all mean the same here
            throw new InvalidCard('Not a readable vCard: '.$e->getMessage(), previous: $e);
        }
        if (!$card instanceof VCardComponent) {
            throw new InvalidCard('Not a vCard');
        }
        self::writeUrisAsRead($card);

        return new self($card);
    }

    /**
     * A new, empty card.
     */
    public static function blank(string $uid): self
    {
        return new self(new VCardComponent(['VERSION' => '3.0', 'PRODID' => self::PRODID, 'UID' => $uid, 'N' => ['', '', '', '', ''], 'FN' => ''], false));
    }

    /**
     * Cuts a .vcf file into its cards, without reading them: a broken card
     * does not take the others down with it.
     *
     * @return list<string>
     */
    public static function splitAll(string $file): array
    {
        if (str_starts_with($file, "\xEF\xBB\xBF")) {
            $file = substr($file, 3);
        }

        $cards = [];
        $lines = [];
        $depth = 0;
        foreach (preg_split("/\r\n|\n|\r/", $file) ?: [] as $line) {
            // A folded line starts with a space, so only the end is trimmed
            $bare = strtoupper(rtrim($line));
            if ('BEGIN:VCARD' === $bare) {
                ++$depth;
            }
            if ($depth > 0) {
                $lines[] = $line;
            }
            if ('END:VCARD' === $bare && $depth > 0 && 0 === --$depth) {
                $cards[] = implode("\r\n", $lines)."\r\n";
                $lines = [];
            }
        }

        return $cards;
    }

    /**
     * The card in the order it was read, new lines at the end. A line that
     * was not edited is written exactly as it came, not as vobject would
     * write it: vobject changes the escaping of some values it does not know
     * (a ";" in an X- property, GEO), and other apps may care.
     */
    public function toString(): string
    {
        $children = $this->card->children();
        $order = [];
        foreach ($children as $i => $child) {
            $order[$i] = match (true) {
                'VERSION' === $child->name => -1,
                $child instanceof Property && isset($child->lineIndex) => $child->lineIndex,
                default => PHP_INT_MAX,
            };
        }
        // Stable: lines added during this edit keep the order they were added in
        $positions = array_keys($children);
        array_multisort($order, SORT_ASC, SORT_NUMERIC, $positions, SORT_ASC, SORT_NUMERIC, $children);

        $out = "BEGIN:VCARD\r\n";
        foreach ($children as $child) {
            $serialized = $child->serialize();
            if ($child instanceof Property && isset($this->read[$child], $child->lineString) && $this->read[$child] === $serialized) {
                $serialized = self::fold($child->lineString);
            }
            $out .= $serialized;
        }

        return $out."END:VCARD\r\n";
    }

    /**
     * Lines of at most 75 bytes, never cutting a UTF-8 character (RFC 6350 section 3.2).
     */
    private static function fold(string $line): string
    {
        // Each piece gets a line break and a space; the last one only needs the break
        return substr(preg_replace('/((?:^.)?.{1,74}(?![\x80-\xbf]))/', "$1\r\n ", $line) ?? $line."\r\n ", 0, -1);
    }

    public function uid(): ?string
    {
        return $this->text('UID');
    }

    /**
     * Only for import, when the book already has a card with this UID.
     */
    public function replaceUid(string $uid): void
    {
        $this->card->remove('UID');
        $this->card->add('UID', $uid);
    }

    /**
     * What the cache keeps beside the card, for the list.
     *
     * @return Summary
     */
    public function summary(): array
    {
        return [
            'name' => $this->name(),
            'org' => $this->org(),
            'emails' => array_values(array_filter(array_map(fn (Property $p) => $this->flat($p), $this->listed('EMAIL')), static fn (string $e) => '' !== $e)),
            'phones' => array_values(array_filter(array_map(fn (Property $p) => $this->phone($p), $this->listed('TEL')), static fn (string $t) => '' !== $t)),
            'hasPhoto' => null !== $this->photo(),
        ];
    }

    /**
     * The card as the address book shows it.
     *
     * @return Model
     */
    public function toArray(): array
    {
        $n = $this->first('N');
        $parts = null === $n ? [] : $this->parts($n);

        $emails = [];
        foreach ($this->listed('EMAIL') as $key => $p) {
            $emails[] = ['key' => $key, 'value' => $this->flat($p), 'type' => self::type($p, self::PLACE_TYPES), 'label' => $this->label($p)];
        }
        $phones = [];
        foreach ($this->listed('TEL') as $key => $p) {
            $phones[] = ['key' => $key, 'value' => $this->phone($p), 'type' => self::type($p, self::PHONE_TYPES), 'label' => $this->label($p)];
        }
        $addresses = [];
        foreach ($this->listed('ADR') as $key => $p) {
            $adr = array_pad($this->parts($p), 7, '');
            $addresses[] = ['key' => $key, 'type' => self::type($p, self::PLACE_TYPES), 'street' => $adr[2], 'city' => $adr[3], 'region' => $adr[4], 'postalCode' => $adr[5], 'country' => $adr[6]];
        }
        $urls = [];
        foreach ($this->listed('URL') as $key => $p) {
            $urls[] = ['key' => $key, 'value' => $this->flat($p)];
        }

        return [
            'name' => $this->name(),
            'firstName' => self::nullIfEmpty($parts[1] ?? ''),
            'lastName' => self::nullIfEmpty($parts[0] ?? ''),
            'org' => $this->org(),
            'title' => $this->text('TITLE'),
            'emails' => $emails,
            'phones' => $phones,
            'addresses' => $addresses,
            'urls' => $urls,
            'birthday' => $this->birthday(),
            'note' => $this->text('NOTE'),
            'photo' => null !== $this->photo(),
        ];
    }

    /**
     * Applies what the editor sent. A field equal to what the card already
     * shows is not written, so lines the user did not change stay byte for byte.
     */
    public function apply(CardInput $input): void
    {
        $before = $this->toArray();
        $first = trim($input->firstName ?? '');
        $last = trim($input->lastName ?? '');
        $org = trim($input->org ?? '');

        $namesChanged = $first !== ($before['firstName'] ?? '') || $last !== ($before['lastName'] ?? '');
        $orgChanged = $org !== ($before['org'] ?? '');
        if ($namesChanged) {
            $this->setNames($first, $last);
        }
        if ($orgChanged) {
            $this->setOrg($org);
        }
        $this->setText('TITLE', trim($input->title ?? ''), $before['title']);
        $this->setText('NOTE', trim(str_replace(["\r\n", "\r"], "\n", $input->note ?? '')), $before['note']);
        $this->setEmails($input->emails);
        $this->setPhones($input->phones);
        $this->setAddresses($input->addresses);
        $this->setUrls($input->urls);
        if (($input->birthday ?? '') !== ($before['birthday'] ?? '')) {
            $this->setBirthday($input->birthday ?? '');
        }

        // FN follows the names, unless the user never touched them
        if ($namesChanged || $orgChanged || null === $this->text('FN')) {
            $emails = array_map(static fn (EmailInput $e) => trim($e->value), $input->emails);
            $fn = trim($first.' '.$last);
            $fn = '' !== $fn ? $fn : ('' !== $org ? $org : ($emails[0] ?? ''));
            if ('' !== $fn) {
                $this->setText('FN', $fn, $this->text('FN'));
            }
        }

        $this->touch();
    }

    /**
     * The card's inline picture, if it is one of the types the app serves.
     *
     * @return ?array{mime: string, data: string}
     */
    public function photo(): ?array
    {
        foreach ($this->listed('PHOTO') as $p) {
            $mime = null;
            $data = null;
            if ($p instanceof Binary) {
                $data = $p->getValue();
                foreach ($p->parameters as $name => $parameter) {
                    // "TYPE=JPEG", "MEDIATYPE=image/jpeg", or 2.1's bare "PHOTO;JPEG"
                    $type = strtoupper(null === $parameter->getValue() ? (string) $name : (in_array($name, ['TYPE', 'MEDIATYPE'], true) ? $parameter->getValue() : ''));
                    $mime ??= VCard::PHOTO_TYPES[$type] ?? (in_array(strtolower($type), VCard::PHOTO_TYPES, true) ? strtolower($type) : null);
                }
            } elseif ($p instanceof Uri && 1 === preg_match('~^data:(image/[a-z0-9.+-]+);base64,(.*)$~is', $this->flat($p), $m)) {
                $mime = strtolower($m[1]);
                $data = base64_decode(preg_replace('/\s+/', '', $m[2]) ?? '', true);
            }
            if (is_string($data) && '' !== $data && in_array($mime, VCard::PHOTO_TYPES, true)) {
                return ['mime' => $mime, 'data' => $data];
            }
        }

        return null;
    }

    /**
     * Replaces the picture with this JPEG, in the way the card's version writes it.
     */
    public function setPhoto(string $jpeg): void
    {
        $this->card->remove('PHOTO');
        if ($this->isVersion4()) {
            $this->card->add(new PlainUri($this->card, 'PHOTO', 'data:image/jpeg;base64,'.base64_encode($jpeg)));
        } else {
            $this->card->add('PHOTO', $jpeg, ['ENCODING' => 'b', 'TYPE' => 'JPEG']);
        }
        $this->touch();
    }

    public function removePhoto(): void
    {
        $this->card->remove('PHOTO');
        $this->touch();
    }

    /**
     * vobject 5 escapes the commas of a URI when writing it, but not all of
     * them when reading: an edited link would grow a backslash, and a 4.0
     * picture ("data:image/jpeg;base64,...") would break. URIs are swapped
     * for a property that writes them as they are.
     */
    private static function writeUrisAsRead(VCardComponent $card): void
    {
        $children = $card->children();
        $swapped = false;
        foreach ($children as $i => $child) {
            if (!$child instanceof Uri || $child instanceof PlainUri) {
                continue;
            }
            $plain = new PlainUri($card, (string) $child->name, $child->getValue(), [], $child->group);
            $plain->parameters = $child->parameters;
            if (isset($child->lineIndex, $child->lineString)) {
                $plain->lineIndex = $child->lineIndex;
                $plain->lineString = $child->lineString;
            }
            $children[$i] = $plain;
            $swapped = true;
        }
        if (!$swapped) {
            return;
        }
        // Components have no "replace": empty it and add everything back
        foreach ($children as $child) {
            $card->remove((string) $child->name);
        }
        foreach ($children as $child) {
            $card->add($child);
        }
    }

    private function name(): ?string
    {
        return $this->text('FN') ?? $this->org() ?? $this->summaryEmail();
    }

    private function summaryEmail(): ?string
    {
        foreach ($this->listed('EMAIL') as $p) {
            if ('' !== $this->flat($p)) {
                return $this->flat($p);
            }
        }

        return null;
    }

    private function org(): ?string
    {
        $org = $this->first('ORG');

        return null === $org ? null : self::nullIfEmpty($this->parts($org)[0] ?? '');
    }

    /**
     * "1984-03-12", or "--03-12" for a birthday without a year: written so
     * in 4.0, or by Apple as year 1604 with X-APPLE-OMIT-YEAR.
     */
    private function birthday(): ?string
    {
        $bday = $this->first('BDAY');
        if (null === $bday) {
            return null;
        }
        $raw = $this->flat($bday);
        if (1 === preg_match('/^(\d{4})-?(\d{2})-?(\d{2})(T.*)?$/', $raw, $m)) {
            $omitted = ($bday->parameters['X-APPLE-OMIT-YEAR'] ?? null)?->getValue();

            return $omitted === $m[1] ? "--{$m[2]}-{$m[3]}" : "{$m[1]}-{$m[2]}-{$m[3]}";
        }
        if (1 === preg_match('/^--(\d{2})-?(\d{2})$/', $raw, $m)) {
            return "--{$m[1]}-{$m[2]}";
        }

        return null;
    }

    private function setNames(string $first, string $last): void
    {
        $n = $this->first('N');
        if (null === $n) {
            $this->card->add('N', [$last, $first, '', '', '']);

            return;
        }
        // Additional names, prefixes and suffixes are kept
        $parts = array_pad($this->parts($n), 5, '');
        $parts[0] = $last;
        $parts[1] = $first;
        $n->setParts($parts);
    }

    private function setOrg(string $org): void
    {
        $property = $this->first('ORG');
        if (null === $property) {
            if ('' !== $org) {
                $this->card->add('ORG', [$org]);
            }

            return;
        }
        // Departments after the name are kept
        $parts = $this->parts($property);
        $parts[0] = $org;
        if ('' === implode('', $parts)) {
            $this->card->remove($property);
        } else {
            $property->setParts($parts);
        }
    }

    /**
     * Sets the first property of that name, removes it when empty.
     */
    private function setText(string $name, string $value, ?string $before): void
    {
        if ($value === ($before ?? '')) {
            return;
        }
        $property = $this->first($name);
        if ('' === $value) {
            if (null !== $property) {
                $this->card->remove($property);
            }
        } elseif (null === $property) {
            $this->card->add($name, $value);
        } else {
            $property->setValue($value);
        }
    }

    /**
     * @param list<EmailInput> $rows
     */
    private function setEmails(array $rows): void
    {
        $existing = $this->listed('EMAIL');
        $kept = [];
        foreach ($rows as $row) {
            $value = trim($row->value);
            $property = $this->claim($existing, $row->key, $kept);
            if (null === $property) {
                $this->card->add('EMAIL', $value, $this->typeParameter($row->type));
                continue;
            }
            if ($value !== $this->flat($property)) {
                $property->setValue($value);
            }
            $this->setType($property, $row->type, self::PLACE_TYPES);
        }
        $this->removeUnclaimed($existing, $kept);
    }

    /**
     * @param list<PhoneInput> $rows
     */
    private function setPhones(array $rows): void
    {
        $existing = $this->listed('TEL');
        $kept = [];
        foreach ($rows as $row) {
            $value = trim($row->value);
            $property = $this->claim($existing, $row->key, $kept);
            if (null === $property) {
                $this->card->add('TEL', $value, $this->typeParameter($row->type));
                continue;
            }
            if ($value !== $this->phone($property)) {
                // A 4.0 "tel:" URI stays one
                $property->setValue($property instanceof Uri ? 'tel:'.$value : $value);
            }
            $this->setType($property, $row->type, self::PHONE_TYPES);
        }
        $this->removeUnclaimed($existing, $kept);
    }

    /**
     * @param list<AddressInput> $rows
     */
    private function setAddresses(array $rows): void
    {
        $existing = $this->listed('ADR');
        $kept = [];
        foreach ($rows as $row) {
            if ($row->isEmpty()) {
                continue;
            }
            $fields = [trim($row->street), trim($row->city), trim($row->region), trim($row->postalCode), trim($row->country)];
            $property = $this->claim($existing, $row->key, $kept);
            if (null === $property) {
                $this->card->add('ADR', ['', '', ...$fields], $this->typeParameter($row->type));
                continue;
            }
            // The post office box and extended address are kept
            $parts = array_pad($this->parts($property), 7, '');
            if (array_slice($parts, 2, 5) !== $fields) {
                $property->setParts([$parts[0], $parts[1], ...$fields, ...array_slice($parts, 7)]);
            }
            $this->setType($property, $row->type, self::PLACE_TYPES);
        }
        $this->removeUnclaimed($existing, $kept);
    }

    /**
     * @param list<UrlInput> $rows
     */
    private function setUrls(array $rows): void
    {
        $existing = $this->listed('URL');
        $kept = [];
        foreach ($rows as $row) {
            $value = trim($row->value);
            $property = $this->claim($existing, $row->key, $kept);
            if (null === $property) {
                $this->card->add(new PlainUri($this->card, 'URL', $value));
            } elseif ($value !== $this->flat($property)) {
                $property->setValue($value);
            }
        }
        $this->removeUnclaimed($existing, $kept);
    }

    private function setBirthday(string $birthday): void
    {
        $this->card->remove('BDAY');
        if (1 !== preg_match('/^(\d{4}|-)-(\d{2})-(\d{2})$/', $birthday, $m)) {
            return;
        }
        $year = '-' === $m[1] ? '--' : $m[1];
        $this->card->add('BDAY', $this->isVersion4() ? $year.$m[2].$m[3] : ('--' === $year ? '--' : $year.'-').$m[2].'-'.$m[3]);
    }

    /**
     * The existing property a row points at, once: a key sent twice, or one
     * that is not on the card, makes a new line.
     *
     * @param list<Property>   $existing
     * @param array<int, true> $kept
     */
    private function claim(array $existing, ?int $key, array &$kept): ?Property
    {
        if (null === $key || !isset($existing[$key]) || isset($kept[$key])) {
            return null;
        }
        $kept[$key] = true;

        return $existing[$key];
    }

    /**
     * Lines the editor did not send back are removed, with the lines of their
     * Apple group (its X-ABLabel, for instance).
     *
     * @param list<Property>   $existing
     * @param array<int, true> $kept
     */
    private function removeUnclaimed(array $existing, array $kept): void
    {
        foreach ($existing as $key => $property) {
            if (isset($kept[$key])) {
                continue;
            }
            $this->card->remove($property);
            if (null === $property->group || '' === $property->group) {
                continue;
            }
            foreach ($this->card->select($property->group.'.') as $sibling) {
                if ($sibling instanceof Property && !in_array($sibling->name, self::LISTS, true)) {
                    $this->card->remove($sibling);
                }
            }
        }
    }

    /**
     * home, work or cell, else other. Only the TYPE values the app knows are
     * read; "pref", "voice" or "internet" are left alone.
     *
     * @param list<string> $known
     */
    private static function type(Property $property, array $known): string
    {
        $values = array_map(strtolower(...), self::typeValues($property));
        foreach ($known as $type) {
            if (in_array($type, $values, true)) {
                return $type;
            }
        }

        return 'other';
    }

    /**
     * Changes the type only when it changed, and only the TYPE values the app knows.
     *
     * @param list<string> $known
     */
    private function setType(Property $property, string $type, array $known): void
    {
        if (self::type($property, $known) === $type) {
            return;
        }
        $parameter = $property->parameters['TYPE'] ?? null;
        $values = array_values(array_filter(
            self::typeValues($property),
            static fn (string $v) => !in_array(strtolower($v), self::PHONE_TYPES, true),
        ));
        if ('other' !== $type) {
            $values[] = $this->isVersion4() ? $type : strtoupper($type);
        }
        if ([] === $values) {
            unset($property->parameters['TYPE']);
        } elseif ($parameter instanceof Parameter) {
            $parameter->setParts($values);
        } else {
            $property->add('TYPE', $values);
        }
    }

    /**
     * The TYPE values, also when a 4.0 card quotes them as one: TYPE="cell,voice".
     *
     * @return list<string>
     */
    private static function typeValues(Property $property): array
    {
        $values = [];
        foreach (($property->parameters['TYPE'] ?? null)?->getParts() ?? [] as $part) {
            foreach (explode(',', (string) $part) as $value) {
                if ('' !== trim($value)) {
                    $values[] = trim($value);
                }
            }
        }

        return $values;
    }

    /**
     * @return array<string, string>
     */
    private function typeParameter(string $type): array
    {
        if ('other' === $type) {
            return [];
        }

        return ['TYPE' => $this->isVersion4() ? $type : strtoupper($type)];
    }

    private function touch(): void
    {
        $this->card->remove('REV');
        $this->card->add('REV', gmdate('Ymd\THis\Z'));
    }

    private function isVersion4(): bool
    {
        return VCardComponent::VCARD40 === $this->card->getDocumentType();
    }

    /**
     * Apple names a line with an X-ABLabel in the same group, "_$!<Other>!$_" for its own labels.
     */
    private function label(Property $property): ?string
    {
        if (null === $property->group || '' === $property->group) {
            return null;
        }
        $label = array_values($this->card->select($property->group.'.X-ABLABEL'))[0] ?? null;
        if (!$label instanceof Property) {
            return null;
        }
        $text = $this->flat($label);

        return self::nullIfEmpty(1 === preg_match('/^_\$!<(.*)>!\$_$/', $text, $m) ? $m[1] : $text);
    }

    private function phone(Property $property): string
    {
        $value = $this->flat($property);

        return $property instanceof Uri && 0 === stripos($value, 'tel:') ? substr($value, 4) : $value;
    }

    /**
     * @return list<Property>
     */
    private function listed(string $name): array
    {
        return array_values(array_filter($this->card->select($name), static fn ($p) => $p instanceof Property));
    }

    private function first(string $name): ?Property
    {
        return $this->listed($name)[0] ?? null;
    }

    private function text(string $name): ?string
    {
        $property = $this->first($name);

        return null === $property ? null : self::nullIfEmpty($this->flat($property));
    }

    /**
     * The value as one string. Text values split on unescaped commas, which
     * many writers leave in notes and titles: they are joined back.
     */
    private function flat(Property $property): string
    {
        if ($property instanceof Uri || $property instanceof Binary) {
            $value = $property->getValue();

            return is_string($value) ? trim($value) : '';
        }

        return trim(implode(',', $this->parts($property)));
    }

    /**
     * @return list<string>
     */
    private function parts(Property $property): array
    {
        return array_values(array_map(
            static fn ($part) => is_array($part) ? implode(',', array_map(strval(...), $part)) : (string) $part,
            $property->getParts(),
        ));
    }

    private static function nullIfEmpty(string $text): ?string
    {
        $text = trim($text);

        return '' === $text ? null : $text;
    }
}
