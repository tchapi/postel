<?php

declare(strict_types=1);

namespace App\Command;

use App\Imap\ImapClientFactory;
use App\Security\RemoteUser;
use Carbon\Carbon;
use DateTimeImmutable;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Helper\ProgressBar;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\DependencyInjection\Attribute\When;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

use function count;
use function sprintf;

/**
 * Fills a mailbox with synthetic mail: the fixture corpus plus a pile of
 * generated messages spread over the last year. Development only, see
 * dev/mailserver/compose.yaml.
 */
#[AsCommand(name: 'app:dev:seed-mailbox', description: 'Fill a test mailbox with synthetic mail')]
#[When('dev')]
final class SeedMailboxCommand extends Command
{
    private const array SENDERS = [
        ['Bob', 'bob@example.test'],
        ['Carol', 'carol@example.test'],
        ['GitHub', 'notifications@github.example'],
        ['Bank', 'no-reply@bank.example'],
        ['Shop', 'orders@shop.example'],
        ['Newsletter', 'weekly@news.example'],
        ['Zoë Bük', 'zoe@example.test'],
        ['François Dürr', 'francois@example.test'],
    ];

    private const array SUBJECTS = [
        'Re: lunch tomorrow?',
        'Your order #%d has shipped',
        '[repo] PR #%d: fix the thing',
        'Invoice %d is available',
        'Weekly digest, week %d',
        'Réunion de %d minutes',
        'Fwd: photos from the weekend',
        'Quick question',
        'Your password will expire in %d days',
        'Out of office until %d/11',
    ];

    public function __construct(
        private readonly ImapClientFactory $clients,
        #[Autowire('%kernel.project_dir%/tests/Fixtures/mail')]
        private readonly string $fixturesDir,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('login', null, InputOption::VALUE_REQUIRED, 'Mailbox to fill (an IMAP login)', 'alice@example.test')
            ->addOption('count', null, InputOption::VALUE_REQUIRED, 'Number of generated messages', '2000')
            ->addOption('seed', null, InputOption::VALUE_REQUIRED, 'Random seed, for a reproducible mailbox', '42')
        ;
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $login = (string) $input->getOption('login');
        $count = (int) $input->getOption('count');
        if ('' === $login) {
            $io->error('--login cannot be empty');

            return Command::FAILURE;
        }
        mt_srand((int) $input->getOption('seed'));

        $client = $this->clients->forUser(new RemoteUser($login, $login));
        $client->connect();
        $inbox = $client->getFolderByPath('INBOX');
        if (null === $inbox) {
            $io->error('No INBOX for '.$login);

            return Command::FAILURE;
        }

        $fixtures = glob($this->fixturesDir.'/*.eml') ?: [];
        foreach ($fixtures as $file) {
            $raw = (string) file_get_contents($file);
            $inbox->appendMessage(self::crlf($raw));
        }
        $io->text(sprintf('Appended %d fixtures from %s', count($fixtures), $this->fixturesDir));

        $progress = new ProgressBar($output, $count);
        $progress->start();
        $now = new DateTimeImmutable();
        // Earlier messages, so that some of the next ones can answer them
        $sent = [];

        for ($i = 0; $i < $count; ++$i) {
            [$name, $address] = self::SENDERS[mt_rand(0, count(self::SENDERS) - 1)];
            $date = $now->modify(sprintf('-%d minutes', mt_rand(0, 365 * 24 * 60)));
            $subject = sprintf(self::SUBJECTS[mt_rand(0, count(self::SUBJECTS) - 1)], mt_rand(1, 9999));

            $email = (new Email())
                ->from(new Address($address, $name))
                ->to($login)
                ->date($date)
                ->subject($subject)
                ->text(self::paragraphs(mt_rand(1, 6)))
            ;

            // One in five answers an earlier message, a few minutes to a few days later
            if ([] !== $sent && mt_rand(1, 100) <= 20) {
                $parent = $sent[mt_rand(max(0, count($sent) - 50), count($sent) - 1)];
                $date = $parent['date']->modify(sprintf('+%d minutes', mt_rand(5, 3 * 24 * 60)));
                $email->date($date)->subject(preg_match('/^Re: /', $parent['subject']) ? $parent['subject'] : 'Re: '.$parent['subject']);
                $email->getHeaders()->addIdHeader('In-Reply-To', $parent['id']);
                $email->getHeaders()->addTextHeader('References', trim($parent['references'].' <'.$parent['id'].'>'));
            }
            $id = sprintf('seed-%d-%d@example.test', mt_rand(), $i);
            $email->getHeaders()->addIdHeader('Message-ID', $id);
            $sent[] = [
                'id' => $id,
                'subject' => (string) $email->getSubject(),
                'date' => $date,
                'references' => (string) ($email->getHeaders()->get('References')?->getBodyAsString() ?? ''),
            ];

            if (mt_rand(1, 100) <= 70) {
                $email->html('<p>'.nl2br(htmlspecialchars((string) $email->getTextBody())).'</p>');
            }
            if (mt_rand(1, 100) <= 10) {
                $email->attach(random_bytes(mt_rand(1_000, 200_000)), sprintf('file-%d.bin', $i), 'application/octet-stream');
            }

            $flags = mt_rand(1, 100) <= 80 ? ['\Seen'] : [];
            if (mt_rand(1, 100) <= 5) {
                $flags[] = '\Flagged';
            }

            $inbox->appendMessage($email->toString(), $flags, Carbon::instance($date));
            $progress->advance();
        }

        $progress->finish();
        $client->disconnect();
        $io->newLine(2);
        $io->success(sprintf('%d messages in the INBOX of %s', $count + count($fixtures), $login));

        return Command::SUCCESS;
    }

    private static function paragraphs(int $n): string
    {
        $words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua'];
        $out = [];
        for ($p = 0; $p < $n; ++$p) {
            $sentence = [];
            for ($w = mt_rand(8, 40); $w > 0; --$w) {
                $sentence[] = $words[mt_rand(0, count($words) - 1)];
            }
            $out[] = ucfirst(implode(' ', $sentence)).'.';
        }

        return implode("\n\n", $out);
    }

    /**
     * IMAP wants CRLF line endings whatever the fixture file has.
     */
    private static function crlf(string $raw): string
    {
        return preg_replace('/\r?\n/', "\r\n", $raw) ?? $raw;
    }
}
