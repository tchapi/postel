<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Security\RemoteUser;
use PHPUnit\Framework\Attributes\Group;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

use function array_slice;
use function sprintf;

use const JSON_THROW_ON_ERROR;

/**
 * Against the throwaway mail server in dev/mailserver, seeded with
 * app:dev:seed-mailbox. Skipped when it is not running.
 */
#[Group('integration')]
final class MessagesTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $host = $_SERVER['IMAP_HOST'] ?? '127.0.0.1';
        $port = (int) ($_SERVER['IMAP_PORT'] ?? 1143);
        $socket = @fsockopen($host, $port, $errno, $errstr, 1);
        if (false === $socket) {
            self::markTestSkipped(sprintf('No IMAP server on %s:%d', $host, $port));
        }
        fclose($socket);

        $this->client = self::createClient();
    }

    /**
     * @return array<string, mixed>
     */
    private function get(string $uri): array
    {
        $this->client->request('GET', $uri, server: [
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_REMOTE_USER' => 'alice',
            'HTTP_REMOTE_EMAIL' => 'alice@example.test',
        ]);
        self::assertResponseIsSuccessful();

        return (array) json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
    }

    public function testFirstPageIsNewestFirst(): void
    {
        $page = $this->get('/api/folders/INBOX/messages?perPage=20');

        self::assertSame(1, $page['page']);
        self::assertCount(20, $page['items']);
        self::assertGreaterThan(20, $page['total']);
        $dates = array_map(static fn (array $row) => $row['date'], $page['items']);
        $sorted = $dates;
        rsort($sorted);
        self::assertSame($sorted, $dates);
        self::assertArrayHasKey('snippet', $page['items'][0]);
    }

    public function testFixtureMessageWithInlineImageAndAttachments(): void
    {
        $uid = $this->uidOf('<nested@fixtures.webmail>');

        $message = $this->get(sprintf('/api/folders/INBOX/messages/%d', $uid));
        self::assertSame('Erin', $message['from']['name']);
        self::assertSame(['report.pdf', 'numbers.csv'], array_map(static fn ($a) => $a['name'], $message['attachments']));
        self::assertStringContainsString('/parts/1.2.2', (string) $message['html']);
        self::assertFalse($message['hasRemoteImages']);

        $this->client->request('GET', sprintf('/api/folders/INBOX/messages/%d/parts/2', $uid), server: [
            'REMOTE_ADDR' => '127.0.0.1', 'HTTP_REMOTE_USER' => 'alice', 'HTTP_REMOTE_EMAIL' => 'alice@example.test',
        ]);
        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/octet-stream');
        self::assertStringStartsWith('%PDF', (string) $this->client->getResponse()->getContent());
        self::assertStringContainsString('report.pdf', (string) $this->client->getResponse()->headers->get('Content-Disposition'));
    }

    public function testListRowOfTheFixture(): void
    {
        $uid = $this->uidOf('<nested@fixtures.webmail>');
        $row = null;
        foreach ($this->get('/api/folders/INBOX/messages?perPage=100&sort=arrival')['items'] as $item) {
            if ($item['uid'] === $uid) {
                $row = $item;
            }
        }
        if (null === $row) {
            self::markTestSkipped('fixture is not in the latest 100 arrivals any more');
        }

        self::assertSame('Report with everything in it', $row['subject']);
        self::assertSame('erin@example.test', $row['from']['email']);
        self::assertTrue($row['hasAttachments']);
        self::assertStringStartsWith('See the report attached.', $row['snippet']);
    }

    private function uidOf(string $messageId): int
    {
        $clients = self::getContainer()->get(ImapClientFactory::class);
        $user = new RemoteUser('alice', 'alice@example.test');
        $uids = Mailbox::open($clients, $user, 'INBOX', true, static function (Mailbox $mailbox) use ($messageId): array {
            $uids = [];
            foreach ($mailbox->command('UID SEARCH', 'HEADER Message-ID '.Mailbox::quote($messageId))->tokenized('SEARCH') as $row) {
                $uids = [...$uids, ...array_map('intval', array_slice($row, 2))];
            }

            return $uids;
        });
        if ([] === $uids) {
            self::markTestSkipped('fixture corpus not seeded, run app:dev:seed-mailbox');
        }

        return max($uids);
    }

    public function testUnknownFolderIs404(): void
    {
        $this->client->request('GET', '/api/folders/Nope/messages', server: [
            'REMOTE_ADDR' => '127.0.0.1', 'HTTP_REMOTE_USER' => 'alice', 'HTTP_REMOTE_EMAIL' => 'alice@example.test',
        ]);
        self::assertResponseStatusCodeSame(404);
    }
}
