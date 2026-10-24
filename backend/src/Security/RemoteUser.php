<?php

declare(strict_types=1);

namespace App\Security;

use Deprecated;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * The user as asserted by the forward-auth proxy. Nothing is stored locally.
 */
final class RemoteUser implements UserInterface
{
    /**
     * @param non-empty-string $username
     */
    public function __construct(
        public readonly string $username,
        public readonly string $email,
        public readonly ?string $displayName = null,
    ) {
    }

    public function getUserIdentifier(): string
    {
        return $this->username;
    }

    public function getRoles(): array
    {
        return ['ROLE_USER'];
    }

    // Nothing to erase: the proxy holds the credentials. Symfony 7.3 asks empty ones to say so.
    #[Deprecated]
    public function eraseCredentials(): void
    {
    }
}
