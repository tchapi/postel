<?php

declare(strict_types=1);

namespace App\Contacts;

use Override;
use Sabre\VObject\Parser\MimeDir;
use Sabre\VObject\Property;

use function strlen;

/**
 * vobject's reader, remembering each property's line as it was in the file.
 * Its text properties drop that on the way, and CardDocument needs it to
 * write untouched lines back exactly.
 *
 * @psalm-suppress PropertyNotSetInConstructor the parent sets its own state when parsing
 */
final class CardParser extends MimeDir
{
    #[Override]
    protected function readProperty(string $line)
    {
        $property = parent::readProperty($line);
        if ($property instanceof Property) {
            $property->lineIndex = $this->startLine;
            $property->lineString = $line;
            // The parser upper-cases "item1.EMAIL"; Apple writes the group in lower case
            if (null !== $property->group && str_starts_with(strtoupper($line), strtoupper($property->group).'.')) {
                $property->group = substr($line, 0, strlen($property->group));
            }
        }

        return $property;
    }
}
