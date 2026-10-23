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
 * Appends its own message to the dev mail server, acts on it, cleans up.
 */
#[Group('integration')]
final class MessageActionsTest extends WebTestCase
{
    private KernelBrowser $client;
    private int $uid;

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

        $raw = "From: Test <test@example.test>\r\nTo: alice@example.test\r\nSubject: actions test\r\nMessage-ID: <actions-".uniqid()."@test>\r\n\r\nbody\r\n";
        $imap = self::getContainer()->get(ImapClientFactory::class)->forUser(new RemoteUser('alice', 'alice@example.test'));
        $imap->connect();
        $imap->getFolderByPath('INBOX')?->appendMessage($raw);
        $imap->disconnect();

        $uids = $this->search('INBOX', 'HEADER Subject "actions test"');
        if ([] === $uids) {
            self::fail('the appended message is not there');
        }
        $this->uid = max($uids);
    }

    protected function tearDown(): void
    {
        foreach (['INBOX', 'Trash'] as $folder) {
            $uids = $this->search($folder, 'HEADER Subject "actions test"');
            if ([] !== $uids) {
                $this->request('POST', '/api/messages/delete', ['folder' => $folder, 'uids' => $uids]);
            }
        }

        parent::tearDown();
    }

    public function testFlagsRoundTrip(): void
    {
        $this->request('PATCH', '/api/messages/flags', ['folder' => 'INBOX', 'uids' => [$this->uid], 'seen' => true, 'flagged' => true]);
        self::assertResponseStatusCodeSame(204);
        self::assertSame([$this->uid], $this->search('INBOX', 'UID '.$this->uid.' SEEN FLAGGED'));

        $this->request('PATCH', '/api/messages/flags', ['folder' => 'INBOX', 'uids' => [$this->uid], 'seen' => false]);
        self::assertResponseStatusCodeSame(204);
        self::assertSame([$this->uid], $this->search('INBOX', 'UID '.$this->uid.' UNSEEN FLAGGED'));
    }

    public function testMoveToTrashAndBack(): void
    {
        $this->request('POST', '/api/messages/move', ['folder' => 'INBOX', 'uids' => [$this->uid], 'to' => 'Trash']);
        self::assertResponseIsSuccessful();
        $moved = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertCount(1, $moved['uids']);
        self::assertSame([], $this->search('INBOX', 'UID '.$this->uid));

        $this->request('POST', '/api/messages/move', ['folder' => 'Trash', 'uids' => $moved['uids'], 'to' => 'INBOX']);
        self::assertResponseIsSuccessful();
        self::assertCount(1, $this->search('INBOX', 'HEADER Subject "actions test"'));
    }

    public function testMoveToUnknownFolderIs404(): void
    {
        $this->request('POST', '/api/messages/move', ['folder' => 'INBOX', 'uids' => [$this->uid], 'to' => 'Nope']);
        self::assertResponseStatusCodeSame(404);
    }

    public function testInvalidPayloadIs422(): void
    {
        $this->request('PATCH', '/api/messages/flags', ['folder' => 'INBOX', 'uids' => []]);
        self::assertResponseStatusCodeSame(422);
    }

    public function testSearchByText(): void
    {
        $this->request('GET', '/api/folders/INBOX/messages?q=actions%20test');
        self::assertResponseIsSuccessful();
        $page = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertGreaterThanOrEqual(1, $page['total']);
        self::assertSame('actions test', $page['items'][0]['subject']);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function request(string $method, string $uri, array $payload = []): void
    {
        $this->client->request($method, $uri, server: [
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_REMOTE_USER' => 'alice',
            'HTTP_REMOTE_EMAIL' => 'alice@example.test',
            'CONTENT_TYPE' => 'application/json',
        ], content: [] === $payload ? null : json_encode($payload, JSON_THROW_ON_ERROR));
    }

    /**
     * @return list<int>
     */
    private function search(string $folder, string $criteria): array
    {
        $clients = self::getContainer()->get(ImapClientFactory::class);

        return Mailbox::open($clients, new RemoteUser('alice', 'alice@example.test'), $folder, true, static function (Mailbox $mailbox) use ($criteria): array {
            $uids = [];
            foreach ($mailbox->command('UID SEARCH', $criteria)->tokenized('SEARCH') as $row) {
                $uids = [...$uids, ...array_map('intval', array_slice($row, 2))];
            }

            return $uids;
        });
    }
}
