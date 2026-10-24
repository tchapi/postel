<?php

declare(strict_types=1);

namespace App\Imap\Protocol;

use App\Imap\Exception\ImapCommandFailed;
use Webklex\PHPIMAP\Connection\Protocols\ImapProtocol;
use Webklex\PHPIMAP\Exceptions\ConnectionFailedException;

use function is_resource;
use function strlen;

/**
 * Sends one command through webklex's connection and reads the answer off
 * the socket ourselves, literal by literal, until the tagged status line.
 *
 * webklex's own reader parses responses in a way that mangles ENVELOPE and
 * does not understand sections, see docs/architecture.md.
 */
final class RawCommand
{
    public function __construct(private readonly ImapProtocol $protocol)
    {
    }

    public function run(string $command, string $arguments = ''): ImapResponse
    {
        $tag = null;
        $this->protocol->sendRequest($command, '' === $arguments ? [] : [$arguments], $tag);

        $stream = $this->protocol->getStream();
        if (!is_resource($stream)) {
            throw new ConnectionFailedException('no stream');
        }

        $untagged = [];
        while (true) {
            $line = $this->readLine($stream);

            if (str_starts_with($line, $tag.' ')) {
                [, $status, $text] = explode(' ', $line.' ', 3);
                $text = trim($text);
                if ('OK' !== $status) {
                    throw new ImapCommandFailed($command, $status, $text);
                }

                return new ImapResponse($untagged, $status, $text);
            }

            if (str_starts_with($line, '* ')) {
                $untagged[] = $line;
            }
            // "+ " continuation requests are not expected for the commands we send.
        }
    }

    /**
     * One logical line: a literal "{n}" at the end of a physical line pulls in
     * n raw bytes plus the rest of the line, as many times as needed.
     *
     * @param resource $stream
     */
    private function readLine($stream): string
    {
        $buffer = '';
        while (true) {
            $physical = fgets($stream);
            if (false === $physical) {
                throw new ConnectionFailedException('connection closed while reading');
            }
            $buffer .= $physical;

            if (1 !== preg_match('/\{(\d+)\}\r\n$/', $buffer, $m)) {
                break;
            }
            $buffer .= $this->readBytes($stream, (int) $m[1]);
        }

        return "\r\n" === substr($buffer, -2) ? substr($buffer, 0, -2) : $buffer;
    }

    /**
     * @param resource $stream
     */
    private function readBytes($stream, int $length): string
    {
        $data = '';
        while (strlen($data) < $length) {
            // phpstan: $remaining is at least 1 here
            $remaining = $length - strlen($data);
            $chunk = $remaining > 0 ? fread($stream, $remaining) : '';
            if (false === $chunk || '' === $chunk) {
                throw new ConnectionFailedException('connection closed while reading a literal');
            }
            $data .= $chunk;
        }

        return $data;
    }
}
