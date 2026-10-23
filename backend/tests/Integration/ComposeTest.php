<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Security\RemoteUser;
use PHPUnit\Framework\Attributes\Group;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

use function array_slice;
use function sprintf;

use const JSON_THROW_ON_ERROR;

/**
 * Sends real mail through the dev mail server, to alice herself.
 */
#[Group('integration')]
final class ComposeTest extends WebTestCase
{
    private KernelBrowser $client;
    private string $marker;

    protected function setUp(): void
    {
        $socket = @fsockopen($_SERVER['IMAP_HOST'] ?? '127.0.0.1', (int) ($_SERVER['IMAP_PORT'] ?? 1143), $errno, $errstr, 1);
        if (false === $socket) {
            self::markTestSkipped('No IMAP server');
        }
        fclose($socket);

        $this->client = self::createClient();
        $this->marker = 'compose test '.uniqid();
    }

    protected function tearDown(): void
    {
        // PHPUnit runs this after a skip in setUp too, when there is no server to clean up
        if (!isset($this->client)) {
            parent::tearDown();

            return;
        }
        foreach (['INBOX', 'Sent', 'Drafts'] as $folder) {
            $uids = $this->search($folder, 'HEADER Subject "compose test"');
            if ([] !== $uids) {
                $this->request('POST', '/api/messages/delete', ['folder' => $folder, 'uids' => $uids]);
            }
        }

        parent::tearDown();
    }

    public function testSendWithUploadAndReplyHeaders(): void
    {
        // An original to answer
        $this->request('PUT', '/api/drafts', ['to' => [['email' => 'alice@example.test']], 'subject' => $this->marker.' original', 'text' => 'first']);
        self::assertResponseIsSuccessful();
        $original = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);

        $file = tempnam(sys_get_temp_dir(), 'up');
        file_put_contents($file, 'attached bytes');
        $this->client->request('POST', '/api/uploads', server: $this->server(), files: ['file' => new UploadedFile($file, 'notes.txt', 'text/plain', null, true)]);
        self::assertResponseStatusCodeSame(201);
        $upload = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);

        $this->request('POST', '/api/send', [
            'to' => [['email' => 'alice@example.test', 'name' => 'Alice']],
            'subject' => $this->marker.' reply',
            'html' => '<p>Hello <b>there</b></p>',
            'uploads' => [$upload['id']],
            'inReplyTo' => ['folder' => $original['folder'], 'uid' => $original['uid']],
        ]);
        self::assertResponseStatusCodeSame(204);

        // Delivered to the INBOX, with threading headers and the attachment
        $uid = $this->waitFor('INBOX', 'HEADER Subject "'.$this->marker.' reply"');
        $this->request('GET', sprintf('/api/folders/INBOX/messages/%d', $uid));
        $message = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertSame('Alice', $message['from']['name']);
        self::assertStringContainsString('<b>there</b>', $message['html']);
        self::assertSame(['notes.txt'], array_map(static fn ($a) => $a['name'], $message['attachments']));
        self::assertNotEmpty($this->search('INBOX', 'UID '.$uid.' HEADER In-Reply-To ""'), 'no In-Reply-To header');

        // A copy in Sent, the original flagged as answered
        self::assertNotEmpty($this->search('Sent', 'HEADER Subject "'.$this->marker.' reply"'));
        self::assertSame([$original['uid']], $this->search('Drafts', 'UID '.$original['uid'].' ANSWERED'));
    }

    public function testDraftSaveReplacesThePrevious(): void
    {
        $this->request('PUT', '/api/drafts', ['subject' => $this->marker.' v1', 'text' => 'one']);
        self::assertResponseIsSuccessful();
        $first = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertSame('Drafts', $first['folder']);

        $this->request('PUT', '/api/drafts', ['subject' => $this->marker.' v2', 'text' => 'two', 'bcc' => [['email' => 'hidden@example.test']], 'replaces' => $first]);
        self::assertResponseIsSuccessful();
        $second = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);

        self::assertSame([], $this->search('Drafts', 'UID '.$first['uid']));
        self::assertSame([$second['uid']], $this->search('Drafts', 'UID '.$second['uid'].' DRAFT'));

        $this->request('GET', sprintf('/api/folders/Drafts/messages/%d', $second['uid']));
        $draft = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertTrue($draft['draft']);
        self::assertSame('hidden@example.test', $draft['bcc'][0]['email']);
    }

    public function testSendWithoutRecipientIs422(): void
    {
        $this->request('POST', '/api/send', ['subject' => 'x', 'text' => 'y']);
        self::assertResponseStatusCodeSame(422);
    }

    private function waitFor(string $folder, string $criteria): int
    {
        for ($i = 0; $i < 20; ++$i) {
            $uids = $this->search($folder, $criteria);
            if ([] !== $uids) {
                return max($uids);
            }
            usleep(250_000);
        }
        self::fail('Message never arrived in '.$folder);
    }

    /**
     * @return array<string, string>
     */
    private function server(): array
    {
        return ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_REMOTE_USER' => 'alice', 'HTTP_REMOTE_EMAIL' => 'alice@example.test', 'HTTP_REMOTE_NAME' => 'Alice'];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function request(string $method, string $uri, array $payload = []): void
    {
        $this->client->request($method, $uri, server: $this->server() + ['CONTENT_TYPE' => 'application/json'], content: [] === $payload ? null : json_encode($payload, JSON_THROW_ON_ERROR));
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
