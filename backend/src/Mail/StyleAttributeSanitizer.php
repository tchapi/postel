<?php

declare(strict_types=1);

namespace App\Mail;

use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;
use Symfony\Component\HtmlSanitizer\TextSanitizer\StringSanitizer;
use Symfony\Component\HtmlSanitizer\Visitor\AttributeSanitizer\AttributeSanitizerInterface;

/**
 * Keeps inline styles, which most HTML mail relies on, minus anything that
 * loads a resource, runs code or escapes the message box.
 */
final class StyleAttributeSanitizer implements AttributeSanitizerInterface
{
    public function getSupportedElements(): ?array
    {
        return null;
    }

    public function getSupportedAttributes(): array
    {
        return ['style'];
    }

    public function sanitizeAttribute(string $element, string $attribute, string $value, HtmlSanitizerConfig $config): ?string
    {
        $declarations = [];
        foreach (explode(';', $value) as $declaration) {
            $declaration = trim($declaration);
            if ('' === $declaration) {
                continue;
            }
            $lower = strtolower($declaration);
            if (preg_match('/url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|position\s*:\s*(fixed|sticky)/', $lower)) {
                continue;
            }
            $declarations[] = StringSanitizer::encodeHtmlEntities($declaration);
        }

        return [] === $declarations ? null : implode('; ', $declarations);
    }
}
