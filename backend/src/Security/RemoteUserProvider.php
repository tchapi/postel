<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;

/**
 * @implements UserProviderInterface<RemoteUser>
 */
final class RemoteUserProvider implements UserProviderInterface
{
    public function refreshUser(UserInterface $user): UserInterface
    {
        // The firewall is stateless, users are rebuilt from the headers on every request.
        throw new UnsupportedUserException();
    }

    public function supportsClass(string $class): bool
    {
        return RemoteUser::class === $class;
    }

    public function loadUserByIdentifier(string $identifier): UserInterface
    {
        throw new UnsupportedUserException('Users only exist through the forward-auth headers.');
    }
}
