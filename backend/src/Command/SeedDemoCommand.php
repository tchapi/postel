<?php

declare(strict_types=1);

namespace App\Command;

use App\Imap\Exception\ImapCommandFailed;
use App\Imap\FolderRole;
use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Security\RemoteUser;
use Carbon\Carbon;
use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\DependencyInjection\Attribute\When;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Yaml\Yaml;

use function count;
use function in_array;
use function is_array;
use function is_string;
use function sprintf;
use function strlen;

use const PATHINFO_EXTENSION;
use const PATHINFO_FILENAME;

/**
 * Replaces a mailbox's content with the small, believable set of mail in
 * dev/demo/mailbox.yaml, for screenshots and demos. Development only.
 */
#[AsCommand(name: 'app:dev:seed-demo', description: 'Fill a mailbox with a small, realistic set of mail, for screenshots')]
#[When('dev')]
final class SeedDemoCommand extends Command
{
    private const string DOMAIN = 'demo.postel.example';

    public function __construct(
        private readonly ImapClientFactory $clients,
        #[Autowire('%kernel.project_dir%/../dev/demo/mailbox.yaml')]
        private readonly string $file,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('login', null, InputOption::VALUE_REQUIRED, 'Mailbox to fill (an IMAP login). Everything in it is deleted first', 'camille@example.test');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $login = (string) $input->getOption('login');
        $username = explode('@', $login)[0];
        if ('' === $username || !str_contains($login, '@')) {
            $io->error('The login is an email address, like camille@example.test');

            return Command::FAILURE;
        }
        $user = new RemoteUser($username, $login);

        /** @var array{me: array{string, string}, people: array<string, array{string, string}>, folders: list<string>, messages: list<array<string, mixed>>} $data */
        $data = Yaml::parseFile($this->file);
        $people = $data['people'] + ['me' => $data['me']];

        $delimiter = $this->reset($user);
        $paths = [];
        foreach ($data['messages'] as $message) {
            $paths[] = str_replace('/', $delimiter, (string) $message['folder']);
        }
        $this->createFolders($user, array_values(array_unique([...array_map(static fn (string $f) => str_replace('/', $delimiter, $f), $data['folders']), ...$paths])));

        $messageIds = [];
        foreach ($data['messages'] as $i => $message) {
            $messageIds[(string) ($message['id'] ?? 'message-'.$i)] = sprintf('%s@%s', $message['id'] ?? 'message-'.$i, self::DOMAIN);
        }
        $parents = [];
        foreach ($data['messages'] as $i => $message) {
            if (isset($message['reply_to'])) {
                $parents[(string) ($message['id'] ?? 'message-'.$i)] = (string) $message['reply_to'];
            }
        }

        $client = $this->clients->forUser($user);
        $client->connect();
        foreach ($data['messages'] as $i => $message) {
            $key = (string) ($message['id'] ?? 'message-'.$i);
            $email = $this->build($message, $people, $messageIds[$key], self::references($key, $parents, $messageIds));
            $date = new DateTimeImmutable((string) $message['when']);

            $flags = [];
            if ($message['seen'] ?? true) {
                $flags[] = '\Seen';
            }
            if ($message['flagged'] ?? false) {
                $flags[] = '\Flagged';
            }
            if ($message['draft'] ?? false) {
                $flags[] = '\Draft';
            }

            $folder = $client->getFolderByPath(str_replace('/', $delimiter, (string) $message['folder']));
            if (null === $folder) {
                throw new RuntimeException(sprintf('No folder %s', $message['folder']));
            }
            $folder->appendMessage($email->toString(), $flags, Carbon::instance($date));
        }
        $client->disconnect();

        $io->success(sprintf('%d messages in %d folders for %s', count($data['messages']), count(array_unique($paths)), $login));

        return Command::SUCCESS;
    }

    /**
     * Empties every folder and deletes the ones the server did not create on
     * its own. Returns the hierarchy delimiter.
     */
    private function reset(RemoteUser $user): string
    {
        $client = $this->clients->forUser($user);
        $client->connect();
        /** @var array<string, array{delimiter: string, flags: list<string>}> $listed */
        $listed = $client->getConnection()->folders('', '*')->validatedData();
        $client->disconnect();

        $delimiter = '.';
        $custom = [];
        foreach ($listed as $path => $item) {
            $delimiter = '' === $item['delimiter'] ? $delimiter : $item['delimiter'];
            if (in_array('\Noselect', $item['flags'], true) || in_array('\NoSelect', $item['flags'], true)) {
                continue;
            }
            Mailbox::open($this->clients, $user, $path, false, static function (Mailbox $mailbox): void {
                try {
                    $mailbox->command('UID STORE', '1:* +FLAGS.SILENT (\Deleted)');
                    $mailbox->command('EXPUNGE');
                } catch (ImapCommandFailed) {
                    // Already empty
                }
            });
            // INBOX and the special folders the server creates stay, everything else goes
            if ('INBOX' !== $path && !in_array(FolderRole::detect($path, $item['flags']), [FolderRole::Drafts, FolderRole::Sent, FolderRole::Junk, FolderRole::Trash], true)) {
                $custom[] = $path;
            }
        }

        // Children before their parent
        usort($custom, static fn (string $a, string $b) => strlen($b) <=> strlen($a));
        Mailbox::session($this->clients, $user, static function (Mailbox $mailbox) use ($custom): void {
            foreach ($custom as $path) {
                $mailbox->command('DELETE', Mailbox::quote($path));
            }
        });

        return $delimiter;
    }

    /**
     * @param list<string> $paths
     */
    private function createFolders(RemoteUser $user, array $paths): void
    {
        $client = $this->clients->forUser($user);
        $client->connect();
        foreach ($paths as $path) {
            if (null === $client->getFolderByPath($path)) {
                $client->createFolder($path, false);
            }
        }
        $client->disconnect();
    }

    /**
     * @param array<string, mixed>                 $message
     * @param array<string, array{string, string}> $people
     * @param list<string>                         $references
     */
    private function build(array $message, array $people, string $messageId, array $references): Email
    {
        $address = static function (string $key) use ($people): Address {
            if (!isset($people[$key])) {
                throw new RuntimeException(sprintf('Unknown person %s', $key));
            }

            return new Address($people[$key][1], $people[$key][0]);
        };

        $to = is_array($message['to'] ?? null) ? $message['to'] : ['me'];
        $email = (new Email())
            ->from($address((string) $message['from']))
            ->to(...array_map(static fn ($k) => $address((string) $k), $to))
            ->subject((string) $message['subject'])
            ->date(new DateTimeImmutable((string) $message['when']));
        $email->getHeaders()->addIdHeader('Message-ID', $messageId);
        if ([] !== $references) {
            $email->getHeaders()->addIdHeader('In-Reply-To', $references[count($references) - 1]);
            $email->getHeaders()->addIdHeader('References', $references);
        }

        if (is_string($message['html'] ?? null)) {
            $email->html($message['html']);
            $email->text(trim(html_entity_decode(strip_tags(str_replace(['</p>', '</h1>', '</h2>'], "\n\n", $message['html'])))));
        } else {
            $email->text((string) ($message['text'] ?? ''));
        }

        foreach (is_array($message['attachments'] ?? null) ? $message['attachments'] : [] as $name) {
            $email->addPart(self::attachment((string) $name));
        }
        if (is_array($message['invite'] ?? null)) {
            $email->addPart(self::invite($message['invite'], $people, (string) $message['from'], $messageId));
        }

        return $email;
    }

    /**
     * The Message-IDs of a message's ancestors, oldest first.
     *
     * @param array<string, string> $parents
     * @param array<string, string> $messageIds
     *
     * @return list<string>
     */
    private static function references(string $key, array $parents, array $messageIds): array
    {
        $chain = [];
        while (isset($parents[$key]) && isset($messageIds[$parents[$key]]) && count($chain) < 20) {
            $key = $parents[$key];
            array_unshift($chain, $messageIds[$key]);
        }

        return $chain;
    }

    private static function attachment(string $name): DataPart
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return match ($extension) {
            'pdf' => new DataPart(self::pdf(pathinfo($name, PATHINFO_FILENAME)), $name, 'application/pdf'),
            'jpg', 'png' => new DataPart(self::image($name, $extension), $name, 'jpg' === $extension ? 'image/jpeg' : 'image/png'),
            default => new DataPart('', $name, 'application/octet-stream'),
        };
    }

    /**
     * A one-page PDF with the file's name as its title, padded to a believable size.
     */
    private static function pdf(string $title): string
    {
        $text = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], ucfirst(str_replace(['-', '_'], ' ', $title)));
        $stream = sprintf("BT /F1 24 Tf 72 760 Td (%s) Tj ET\n", $text);
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            sprintf("<< /Length %d >>\nstream\n%sendstream", strlen($stream), $stream),
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $i => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= sprintf("%d 0 obj\n%s\nendobj\n", $i + 1, $object);
        }
        $xref = strlen($pdf);
        $pdf .= sprintf("xref\n0 %d\n0000000000 65535 f \n", count($objects) + 1);
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", count($objects) + 1, $xref);

        // Comments after the end are ignored by readers, and make the size look like a real document's
        return $pdf.str_repeat("% padding\n", 2000 + crc32($title) % 8000);
    }

    /**
     * A soft two-colour gradient, so photos and mockups look like images in the list.
     */
    private static function image(string $name, string $extension): string
    {
        $hash = crc32($name);
        $width = 1200;
        $height = 800;
        $image = imagecreatetruecolor($width, $height);
        if (false === $image) {
            throw new RuntimeException('GD is needed for image attachments');
        }
        $from = [120 + $hash % 100, 110 + ($hash >> 8) % 100, 100 + ($hash >> 16) % 100];
        $to = [40 + ($hash >> 4) % 80, 50 + ($hash >> 12) % 80, 60 + ($hash >> 20) % 80];
        for ($y = 0; $y < $height; ++$y) {
            $t = $y / $height;
            $channel = static fn (int $i): int => max(0, min(255, (int) ($from[$i] + ($to[$i] - $from[$i]) * $t)));
            $color = imagecolorallocate($image, $channel(0), $channel(1), $channel(2));
            imageline($image, 0, $y, $width, $y, (int) $color);
        }

        ob_start();
        'png' === $extension ? imagepng($image) : imagejpeg($image, null, 85);

        return (string) ob_get_clean();
    }

    /**
     * @param array<string, mixed>                 $invite
     * @param array<string, array{string, string}> $people
     */
    private static function invite(array $invite, array $people, string $organizer, string $uid): DataPart
    {
        $start = new DateTimeImmutable((string) $invite['start']);
        $end = $start->modify(sprintf('+%d minutes', (int) ($invite['minutes'] ?? 60)));
        $format = static fn (DateTimeImmutable $d) => $d->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');

        $ics = implode("\r\n", [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Postel//Demo//EN',
            'METHOD:REQUEST',
            'BEGIN:VEVENT',
            'UID:'.$uid,
            'DTSTAMP:'.$format(new DateTimeImmutable()),
            'DTSTART:'.$format($start),
            'DTEND:'.$format($end),
            'SUMMARY:'.$invite['title'],
            'LOCATION:'.($invite['location'] ?? ''),
            sprintf('ORGANIZER;CN=%s:mailto:%s', $people[$organizer][0], $people[$organizer][1]),
            sprintf('ATTENDEE;CN=%s;RSVP=TRUE:mailto:%s', $people['me'][0], $people['me'][1]),
            'END:VEVENT',
            'END:VCALENDAR',
            '',
        ]);

        return new DataPart($ics, 'invite.ics', 'text/calendar');
    }
}
