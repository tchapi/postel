<?php

declare(strict_types=1);

namespace App\Contacts;

use Override;
use Sabre\VObject\Parameter;
use Sabre\VObject\Property\Uri;

use function is_array;

/**
 * A URI property written back as it was read. sabre/vobject's own Uri class
 * escapes commas on the way out but not on the way in for URL, so a link with
 * a comma would grow a backslash on every save, and a 4.0 picture
 * ("data:image/jpeg;base64,...") would come out broken. It also adds
 * VALUE=URI to URL and PHOTO, which changes lines nobody edited.
 *
 * @psalm-suppress PropertyNotSetInConstructor $lineIndex and $lineString are only set for lines read from a file
 */
final class PlainUri extends Uri
{
    /**
     * @return array<string, Parameter>
     */
    #[Override]
    public function parameters(): array
    {
        return $this->parameters;
    }

    #[Override]
    public function getRawMimeDirValue(): string
    {
        $value = $this->value;

        return (string) (is_array($value) ? ($value[0] ?? '') : $value);
    }
}
