<?php

declare(strict_types=1);

namespace App\Mail;

use App\Imap\Protocol\BodyPart;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerInterface;

use function sprintf;

/**
 * Makes a message's HTML safe to show: inline images point to our part
 * endpoint, remote images are stripped unless asked for, and the sanitizer
 * drops everything that is not plain formatting.
 */
final class HtmlRenderer
{
    public function __construct(private readonly HtmlSanitizerInterface $mail)
    {
    }

    /**
     * @param callable(string): ?string $partUrl maps a Content-ID to a URL, null when unknown
     *
     * @return array{html: string, hasRemoteImages: bool}
     */
    public function render(string $html, callable $partUrl, bool $allowRemoteImages): array
    {
        $html = preg_replace_callback(
            '/(\s(?:src|background))\s*=\s*(["\']?)cid:([^"\'\s>]+)\2/i',
            static function (array $m) use ($partUrl): string {
                $url = $partUrl(rawurldecode($m[3]));

                return null === $url ? '' : $m[1].'="'.$url.'"';
            },
            $html,
        ) ?? $html;

        $remote = '/(\s(?:src|srcset|background|poster))\s*=\s*(["\']?)\s*(?:https?:)?\/\/[^"\'\s>]*\2/i';
        $hasRemoteImages = 1 === preg_match($remote, $html) || 1 === preg_match('/url\s*\(\s*["\']?\s*(?:https?:)?\/\//i', $html);
        if (!$allowRemoteImages) {
            $html = preg_replace($remote, '', $html) ?? $html;
        }

        return [
            'html' => $this->mail->sanitizeFor('body', $html),
            'hasRemoteImages' => $hasRemoteImages,
        ];
    }

    /**
     * @return callable(string): ?string
     */
    public static function partUrlResolver(BodyPart $structure, string $folder, int $uid): callable
    {
        return static function (string $contentId) use ($structure, $folder, $uid): ?string {
            $part = $structure->findByContentId($contentId);

            return null === $part ? null : sprintf('/api/folders/%s/messages/%d/parts/%s', rawurlencode($folder), $uid, $part->section);
        };
    }
}
