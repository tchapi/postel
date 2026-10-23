<?php

declare(strict_types=1);

namespace App\Tests\Security;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class RemoteUserAuthenticatorTest extends WebTestCase
{
    public function testHealthIsPublic(): void
    {
        $client = self::createClient();
        $client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
    }

    public function testMissingHeadersIsUnauthorized(): void
    {
        $client = self::createClient();
        $client->request('GET', '/api/me');

        self::assertResponseStatusCodeSame(401);
        self::assertJsonStringEqualsJsonString('{"error":"unauthenticated"}', (string) $client->getResponse()->getContent());
    }

    public function testHeadersFromAnUntrustedProxyAreIgnored(): void
    {
        $client = self::createClient();
        $client->request('GET', '/api/me', server: [
            'REMOTE_ADDR' => '203.0.113.7',
            'HTTP_REMOTE_USER' => 'mallory',
            'HTTP_REMOTE_EMAIL' => 'mallory@example.com',
        ]);

        self::assertResponseStatusCodeSame(401);
    }

    public function testHeadersFromTheTrustedProxyAuthenticate(): void
    {
        $client = self::createClient();
        $client->request('GET', '/api/me', server: [
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_REMOTE_USER' => 'alice',
            'HTTP_REMOTE_EMAIL' => 'alice@example.com',
            'HTTP_REMOTE_NAME' => 'Alice',
        ]);

        self::assertResponseIsSuccessful();
        self::assertJsonStringEqualsJsonString(
            '{"username":"alice","email":"alice@example.com","displayName":"Alice"}',
            (string) $client->getResponse()->getContent(),
        );
    }
}
