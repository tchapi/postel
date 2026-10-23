<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261023205651 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Contacts cache from Davis';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE contact (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, search VARCHAR(600) NOT NULL, owner VARCHAR(255) NOT NULL, book VARCHAR(500) NOT NULL, name VARCHAR(255) DEFAULT NULL, email VARCHAR(320) NOT NULL)');
        $this->addSql('CREATE INDEX contact_owner ON contact (owner)');
        $this->addSql('CREATE TABLE contact_sync (home VARCHAR(500) DEFAULT NULL, books CLOB NOT NULL, checked_at DATETIME DEFAULT NULL, owner VARCHAR(255) NOT NULL, PRIMARY KEY (owner))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE contact');
        $this->addSql('DROP TABLE contact_sync');
    }
}
