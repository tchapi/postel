<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Imap\FolderRole;
use App\Imap\FolderService;
use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Security\RemoteUser;
use PHPUnit\Framework\Attributes\Group;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

use function sprintf;

use const JSON_THROW_ON_ERROR;

/**
 * Archiving creates the archive folder when the account has none. Runs only
 * when alice has none, and removes the folder it made.
 */
#[Group('integration')]
final class ArchiveFolderTest extends WebTestCase
{
    private KernelBrowser $client;
    private RemoteUser $alice;

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
        $this->alice = new RemoteUser('alice', 'alice@example.test');
        if (null !== self::getContainer()->get(FolderService::class)->findByRole($this->alice, FolderRole::Archive)) {
            self::markTestSkipped('alice already has an archive folder');
        }
    }

    protected function tearDown(): void
    {
        if (isset($this->client)) {
            $clients = self::getContainer()->get(ImapClientFactory::class);
            $path = self::getContainer()->get(FolderService::class)->findByRole($this->alice, FolderRole::Archive);
            if (null !== $path) {
                Mailbox::session($clients, $this->alice, static fn (Mailbox $mailbox) => $mailbox->command('DELETE', Mailbox::quote($path)));
            }
        }

        parent::tearDown();
    }

    public function testCreatesTheArchiveFolderOnce(): void
    {
        $first = $this->archive();
        self::assertSame('Archive', $first);

        $this->client->request('GET', '/api/folders', server: $this->headers());
        $folders = json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        $archive = array_values(array_filter($folders, static fn (array $f) => 'archive' === $f['role']));
        self::assertSame([$first], array_column($archive, 'id'));

        self::assertSame($first, $this->archive(), 'a second call finds the folder instead of creating another');
    }

    private function archive(): string
    {
        $this->client->request('POST', '/api/folders/archive', server: $this->headers());
        self::assertResponseIsSuccessful();

        return json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR)['id'];
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_REMOTE_USER' => 'alice', 'HTTP_REMOTE_EMAIL' => 'alice@example.test'];
    }
}
