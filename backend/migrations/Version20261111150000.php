<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261111150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Forget the address books\' sync tokens, so cards are read again with their picture';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("UPDATE contact_sync SET books = '{}'");
    }

    public function down(Schema $schema): void
    {
        // Nothing to undo: the books are simply fetched once more
    }
}
