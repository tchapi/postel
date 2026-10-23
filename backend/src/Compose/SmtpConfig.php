<?php

declare(strict_types=1);

namespace App\Compose;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

final readonly class SmtpConfig
{
    public function __construct(
        #[Autowire(env: 'SMTP_HOST')]
        public string $host,
        #[Autowire(env: 'int:SMTP_PORT')]
        public int $port,
        #[Autowire(env: 'SMTP_ENCRYPTION')]
        public string $encryption,
        #[Autowire(env: 'bool:SMTP_VALIDATE_CERT')]
        public bool $validateCert,
    ) {
    }
}
