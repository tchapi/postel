<?php

declare(strict_types=1);

namespace App\Mail;

use App\Imap\Dto\Address;
use DateTimeImmutable;
use Exception;
use ZBateson\MailMimeParser\Header\AddressHeader;
use ZBateson\MailMimeParser\IMessage;

/**
 * Typed access to the headers of a parsed message, RFC 2047 decoded.
 */
final readonly class Headers
{
    public function __construct(private IMessage $message)
    {
    }

    public function subject(): string
    {
        return trim((string) $this->message->getSubject());
    }

    public function messageId(): ?string
    {
        $value = $this->message->getHeaderValue('Message-ID');

        return null === $value ? null : trim($value);
    }

    /**
     * The weekday is dropped before parsing: PHP moves a date to the next
     * matching weekday when the name is wrong, and senders get it wrong.
     */
    public function date(): ?DateTimeImmutable
    {
        $raw = trim((string) $this->message->getHeaderValue('Date'));
        if ('' === $raw) {
            return null;
        }
        $raw = preg_replace('/^[a-z]{3},?\s*/i', '', $raw) ?? $raw;
        $raw = preg_replace('/\s*\([^)]*\)\s*$/', '', $raw) ?? $raw;

        try {
            return new DateTimeImmutable($raw);
        } catch (Exception) {
            return null;
        }
    }

    public function from(): ?Address
    {
        return $this->addresses('From')[0] ?? null;
    }

    /**
     * @return list<Address>
     */
    public function addresses(string $name): array
    {
        $header = $this->message->getHeader($name);
        if (!$header instanceof AddressHeader) {
            return [];
        }

        $addresses = [];
        foreach ($header->getAddresses() as $address) {
            $email = trim($address->getEmail());
            if ('' === $email) {
                continue;
            }
            $personal = trim($address->getName());
            $addresses[] = new Address($email, '' === $personal ? null : $personal);
        }

        return $addresses;
    }
}
