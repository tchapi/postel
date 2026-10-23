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
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Drafts live in the Drafts folder like any other message. Saving again
 * appends a new one and removes the previous.
 *
 * @phpstan-type Saved array{folder: string, uid: int}
 */
final class DraftStore
{
    public function __construct(
        private readonly ImapClientFactory $clients,
        private readonly FolderService $folders,
        private readonly MessageActionService $actions,
        private readonly MessageBuilder $builder,
    ) {
    }

    /**
     * @return Saved
     */
    public function save(RemoteUser $user, Draft $draft): array
    {
        $folder = $this->folders->findByRole($user, FolderRole::Drafts);
        if (null === $folder) {
            throw new ConflictHttpException('No Drafts folder');
        }

        // toString() drops Bcc, which is right for sending and wrong for a draft.
        $email = $this->builder->build($user, $draft);
        $headers = $email->getPreparedHeaders();
        if ([] !== $email->getBcc()) {
            $headers->addMailboxListHeader('Bcc', $email->getBcc());
        }
        $raw = $headers->toString().$email->getBody()->toString();
        $uid = Mailbox::open($this->clients, $user, $folder, false, static fn (Mailbox $mailbox): ?int => $mailbox->append($folder, $raw, ['\Draft', '\Seen']));
        if (null === $uid) {
            throw new RuntimeException('The server did not tell the UID of the saved draft (no UIDPLUS?)');
        }

        if (null !== $draft->replaces) {
            $this->actions->delete($user, $draft->replaces->folder, [$draft->replaces->uid]);
        }

        return ['folder' => $folder, 'uid' => $uid];
    }
}
