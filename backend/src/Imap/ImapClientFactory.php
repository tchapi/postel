<?php

declare(strict_types=1);

namespace App\Imap;

use App\Security\RemoteUser;
use Webklex\PHPIMAP\Client;
use Webklex\PHPIMAP\ClientManager;

/**
 * Builds IMAP clients logged in as the user through a Dovecot master user.
 *
 * Dovecot accepts "user*master" with the master password and opens the
 * mailbox of "user", so the webmail never needs the user's own password.
 * See https://doc.dovecot.org/configuration_manual/authentication/master_users/
 */
final class ImapClientFactory
{
    private const string MASTER_SEPARATOR = '*';

    public function __construct(
        private readonly ImapConfig $config,
        private readonly ClientManager $manager = new ClientManager(),
    ) {
    }

    public function masterUser(): string
    {
        return $this->config->masterUser;
    }

    public function masterPassword(): string
    {
        return $this->config->masterPassword;
    }

    public function forUser(RemoteUser $user): Client
    {
        $login = 'username' === $this->config->loginAttribute ? $user->username : $user->email;

        return $this->manager->make([
            'host' => $this->config->host,
            'port' => $this->config->port,
            'encryption' => 'false' === $this->config->encryption ? false : $this->config->encryption,
            'validate_cert' => $this->config->validateCert,
            'username' => $login.self::MASTER_SEPARATOR.$this->config->masterUser,
            'password' => $this->config->masterPassword,
            'protocol' => 'imap',
        ]);
    }
}
