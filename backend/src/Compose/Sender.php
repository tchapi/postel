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
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;

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

    private function transport(RemoteUser $user): EsmtpTransport
    {
        $implicitTls = in_array($this->smtp->encryption, ['ssl', 'tls'], true);
        $transport = new EsmtpTransport($this->smtp->host, $this->smtp->port, $implicitTls);
        $transport
            ->setUsername($user->email.'*'.$this->clients->masterUser())
            ->setPassword($this->clients->masterPassword())
        ;
        $stream = $transport->getStream();
        if (!$this->smtp->validateCert && $stream instanceof SocketStream) {
            $stream->setStreamOptions(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
        }
        if ('false' === $this->smtp->encryption) {
            $transport->setAutoTls(false);
        }

        return $transport;
    }
}
