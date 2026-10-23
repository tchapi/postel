<?php

declare(strict_types=1);

namespace App\Imap;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

final readonly class ImapConfig
{
    public function __construct(
        #[Autowire(env: 'IMAP_HOST')]
        public string $host,
        #[Autowire(env: 'int:IMAP_PORT')]
        public int $port,
        #[Autowire(env: 'IMAP_ENCRYPTION')]
        public string $encryption,
        #[Autowire(env: 'bool:IMAP_VALIDATE_CERT')]
        public bool $validateCert,
        #[Autowire(env: 'IMAP_MASTER_USER')]
        public string $masterUser,
        #[Autowire(env: 'IMAP_MASTER_PASSWORD')]
        public string $masterPassword,
        #[Autowire(env: 'IMAP_LOGIN_ATTRIBUTE')]
        public string $loginAttribute = 'email',
    ) {
    }
}
