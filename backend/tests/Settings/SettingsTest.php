<?php

declare(strict_types=1);

namespace App\Tests\Settings;

use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

use const JSON_THROW_ON_ERROR;

final class SettingsTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = self::createClient();

        $entityManager = self::getContainer()->get(EntityManagerInterface::class);
        $schema = new SchemaTool($entityManager);
        $metadata = $entityManager->getMetadataFactory()->getAllMetadata();
        $schema->dropSchema($metadata);
        $schema->createSchema($metadata);
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function request(string $method, array $payload = [], string $user = 'alice'): array
    {
        $this->client->request($method, '/api/settings', server: [
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_REMOTE_USER' => $user,
            'HTTP_REMOTE_EMAIL' => $user.'@example.test',
            'CONTENT_TYPE' => 'application/json',
        ], content: [] === $payload ? null : json_encode($payload, JSON_THROW_ON_ERROR));

        return (array) json_decode((string) $this->client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
    }

    public function testDefaultsBeforeAnythingIsSaved(): void
    {
        self::assertSame(
            ['fromName' => null, 'signature' => null, 'loadRemoteImages' => false, 'density' => 'comfortable', 'threads' => true, 'language' => 'en', 'accent' => 'violet', 'allowedSenders' => [], 'updatedAt' => null],
            $this->request('GET'),
        );
        self::assertResponseIsSuccessful();
    }

    public function testSaveAndReadBack(): void
    {
        $saved = $this->request('PUT', ['fromName' => ' Alice L. ', 'signature' => '<p>Alice</p><script>x()</script>', 'loadRemoteImages' => true, 'density' => 'compact', 'threads' => false, 'language' => 'fr', 'accent' => 'jade', 'allowedSenders' => ['News@Shop.example', 'news@shop.example']]);
        self::assertResponseIsSuccessful();
        self::assertSame('Alice L.', $saved['fromName']);
        self::assertSame('<p>Alice</p>', $saved['signature']);
        self::assertTrue($saved['loadRemoteImages']);
        self::assertSame('compact', $saved['density']);
        self::assertFalse($saved['threads']);
        self::assertSame('fr', $saved['language']);
        self::assertSame('jade', $saved['accent']);
        self::assertSame(['news@shop.example'], $saved['allowedSenders']);
        self::assertNotNull($saved['updatedAt']);

        self::assertSame($saved, $this->request('GET'));
        self::assertSame('comfortable', $this->request('GET', user: 'bob')['density']);
    }

    public function testEmptySignatureIsNull(): void
    {
        $saved = $this->request('PUT', ['signature' => '<p> </p>']);

        self::assertNull($saved['signature']);
    }

    public function testUnknownAccentIsRejected(): void
    {
        $this->request('PUT', ['accent' => 'chartreuse']);

        self::assertResponseStatusCodeSame(422);
    }

    public function testUnknownDensityIsRejected(): void
    {
        $this->request('PUT', ['density' => 'cosy']);

        self::assertResponseStatusCodeSame(422);
    }
}
