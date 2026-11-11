<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261111142343 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Contacts keep the picture on their card, for avatars';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE contact ADD COLUMN photo CLOB DEFAULT NULL');
        $this->addSql('ALTER TABLE contact ADD COLUMN photo_mime VARCHAR(64) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('CREATE TEMPORARY TABLE __temp__contact AS SELECT id, search, owner, book, name, email FROM contact');
        $this->addSql('DROP TABLE contact');
        $this->addSql('CREATE TABLE contact (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, search VARCHAR(600) NOT NULL, owner VARCHAR(255) NOT NULL, book VARCHAR(500) NOT NULL, name VARCHAR(255) DEFAULT NULL, email VARCHAR(320) NOT NULL)');
        $this->addSql('INSERT INTO contact (id, search, owner, book, name, email) SELECT id, search, owner, book, name, email FROM __temp__contact');
        $this->addSql('DROP TABLE __temp__contact');
        $this->addSql('CREATE INDEX contact_owner ON contact (owner)');
    }
}
