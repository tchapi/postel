<?php

declare(strict_types=1);

namespace App\Contacts;

use App\Security\RemoteUser;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Davis is reached with an app key: Postel logs in as
 * "<login>*<app id>" with the key's secret and Davis acts as <login>, like
 * the Dovecot master user. App keys came with Davis 5.6, see
 * https://github.com/tchapi/davis/pull/313.
 */
final readonly class DavisConfig
{
    public function __construct(
        #[Autowire(env: 'DAVIS_URL')]
        public string $url,
        #[Autowire(env: 'DAVIS_APP_ID')]
        public string $appId,
        #[Autowire(env: 'DAVIS_APP_SECRET')]
        public string $secret,
        #[Autowire(env: 'DAVIS_LOGIN_ATTRIBUTE')]
        public string $loginAttribute = 'username',
    ) {
    }

    public function enabled(): bool
    {
        return '' !== $this->url && '' !== $this->appId && '' !== $this->secret;
    }

    public function login(RemoteUser $user): string
    {
        return ('email' === $this->loginAttribute ? $user->email : $user->username).'*'.$this->appId;
    }
}
