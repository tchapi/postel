<?php

declare(strict_types=1);

namespace App\Compose;

use App\Compose\Request\Draft;
use App\Imap\FolderRole;
use App\Imap\FolderService;
use App\Imap\ImapClientFactory;
use App\Imap\Mailbox;
use App\Imap\MessageActionService;
use App\Security\RemoteUser;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\Transport\Dsn;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransportFactory;
use Symfony\Component\Mailer\Transport\TransportInterface;

use function in_array;

/**
 * Submits through SMTP as the user (master user login, like IMAP), keeps a
 * copy in Sent, flags the original, drops the draft.
 */
final class Sender
{
    public function __construct(
        private readonly SmtpConfig $smtp,
        private readonly ImapClientFactory $clients,
        private readonly FolderService $folders,
        private readonly MessageActionService $actions,
        private readonly MessageBuilder $builder,
        private readonly UploadStore $uploads,
    ) {
    }

    public function send(RemoteUser $user, Draft $draft): void
    {
        $email = $this->builder->build($user, $draft);
        $email->ensureValidity();
        $email->getHeaders()->addIdHeader('Message-ID', $email->generateMessageId());

        // Bcc recipients are in the envelope, symfony/mime keeps them out of the headers.
        $this->transport($user)->send($email, Envelope::create($email));

        $sent = $this->folders->findByRole($user, FolderRole::Sent);
        if (null !== $sent) {
            $raw = $email->toString();
            Mailbox::open($this->clients, $user, $sent, false, static function (Mailbox $mailbox) use ($sent, $raw): void {
                $mailbox->append($sent, $raw, ['\Seen']);
            });
        }

        if (null !== $draft->inReplyTo) {
            $this->actions->setFlags($user, $draft->inReplyTo->folder, [$draft->inReplyTo->uid], ['\Answered']);
        }
        if (null !== $draft->forwardOf) {
            $this->actions->setFlags($user, $draft->forwardOf->folder, [$draft->forwardOf->uid], ['$Forwarded']);
        }
        if (null !== $draft->replaces) {
            $this->actions->delete($user, $draft->replaces->folder, [$draft->replaces->uid]);
        }
        foreach ($draft->uploads as $id) {
            $this->uploads->delete($user, $id);
        }
    }

    private function transport(RemoteUser $user): TransportInterface
    {
        $implicitTls = in_array($this->smtp->encryption, ['ssl', 'tls'], true);
        $options = [];
        if (!$this->smtp->validateCert) {
            $options['verify_peer'] = '0';
        }
        if ('false' === $this->smtp->encryption) {
            $options['auto_tls'] = '0';
        }

        return (new EsmtpTransportFactory())->create(new Dsn(
            $implicitTls ? 'smtps' : 'smtp',
            $this->smtp->host,
            $user->email.'*'.$this->clients->masterUser(),
            $this->clients->masterPassword(),
            $this->smtp->port,
            $options,
        ));
    }
}
