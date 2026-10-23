<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

/**
 * One node of a BODYSTRUCTURE tree, with its IMAP section number ("1", "2.1").
 */
final readonly class BodyPart
{
    /**
     * @param array<string, string> $parameters            Content-Type parameters, lowercased keys
     * @param array<string, string> $dispositionParameters
     * @param list<BodyPart>        $children
     */
    public function __construct(
        public string $section,
        public string $type,
        public string $subtype,
        public array $parameters = [],
        public ?string $contentId = null,
        public ?string $encoding = null,
        public int $size = 0,
        public ?string $disposition = null,
        public array $dispositionParameters = [],
        public array $children = [],
    ) {
    }

    public function mimeType(): string
    {
        return strtolower($this->type.'/'.$this->subtype);
    }

    public function isMultipart(): bool
    {
        return 'multipart' === strtolower($this->type);
    }

    public function filename(): ?string
    {
        return $this->dispositionParameters['filename'] ?? $this->parameters['name'] ?? null;
    }

    /**
     * Inline parts are the ones referenced from the HTML by Content-ID.
     */
    public function isInline(): bool
    {
        return null !== $this->contentId && 'attachment' !== strtolower((string) $this->disposition);
    }

    /**
     * Anything a user would call an attachment: explicitly so, or a non-text
     * part that is not an inline image.
     */
    public function isAttachment(): bool
    {
        if ($this->isMultipart()) {
            return false;
        }
        if ('attachment' === strtolower((string) $this->disposition)) {
            return true;
        }
        if ($this->isInline()) {
            return false;
        }

        return 'text' !== strtolower($this->type) || null !== $this->filename();
    }

    /**
     * @return list<BodyPart>
     */
    public function flatten(): array
    {
        $parts = [$this];
        foreach ($this->children as $child) {
            $parts = [...$parts, ...$child->flatten()];
        }

        return $parts;
    }

    public function find(string $section): ?self
    {
        foreach ($this->flatten() as $part) {
            if ($part->section === $section) {
                return $part;
            }
        }

        return null;
    }

    public function findByContentId(string $contentId): ?self
    {
        $wanted = trim($contentId, '<>');
        foreach ($this->flatten() as $part) {
            if (null !== $part->contentId && trim($part->contentId, '<>') === $wanted) {
                return $part;
            }
        }

        return null;
    }

    /**
     * @return list<BodyPart>
     */
    public function attachments(): array
    {
        return array_values(array_filter($this->flatten(), static fn (self $part) => $part->isAttachment()));
    }
}
