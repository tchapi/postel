<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261112222230 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'The contacts cache keeps whole cards, for the address book; it is emptied and filled again';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE contact_card (id VARCHAR(32) NOT NULL, name VARCHAR(255) DEFAULT NULL, org VARCHAR(255) DEFAULT NULL, emails CLOB NOT NULL, phones CLOB NOT NULL, sort VARCHAR(255) NOT NULL, has_photo BOOLEAN NOT NULL, owner VARCHAR(255) NOT NULL, book VARCHAR(500) NOT NULL, href VARCHAR(500) NOT NULL, etag VARCHAR(255) NOT NULL, vcard CLOB NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX contact_card_owner ON contact_card (owner)');
        $this->addSql('CREATE INDEX contact_card_owner_book ON contact_card (owner, book)');
        // The cache can be thrown away: its rows have no card to point at, so it starts empty
        $this->addSql('DROP TABLE contact');
        $this->addSql('CREATE TABLE contact (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, search VARCHAR(600) NOT NULL, owner VARCHAR(255) NOT NULL, book VARCHAR(500) NOT NULL, name VARCHAR(255) DEFAULT NULL, email VARCHAR(320) NOT NULL, card_id VARCHAR(32) NOT NULL, has_photo BOOLEAN NOT NULL)');
        $this->addSql('CREATE INDEX contact_owner ON contact (owner)');
        $this->addSql('CREATE INDEX contact_card_id ON contact (card_id)');
        $this->addSql('ALTER TABLE contact_sync ADD COLUMN available BOOLEAN DEFAULT 1 NOT NULL');
        // Every book is fetched again, on the next use rather than in five minutes
        $this->addSql("UPDATE contact_sync SET books = '{}', checked_at = NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE contact_card');
        $this->addSql('DROP TABLE contact');
        $this->addSql('CREATE TABLE contact (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, search VARCHAR(600) NOT NULL, owner VARCHAR(255) NOT NULL, book VARCHAR(500) NOT NULL, name VARCHAR(255) DEFAULT NULL, email VARCHAR(320) NOT NULL, photo CLOB DEFAULT NULL, photo_mime VARCHAR(64) DEFAULT NULL)');
        $this->addSql('CREATE INDEX contact_owner ON contact (owner)');
        $this->addSql('CREATE TEMPORARY TABLE __temp__contact_sync AS SELECT home, books, checked_at, owner FROM contact_sync');
        $this->addSql('DROP TABLE contact_sync');
        $this->addSql('CREATE TABLE contact_sync (home VARCHAR(500) DEFAULT NULL, books CLOB NOT NULL, checked_at DATETIME DEFAULT NULL, owner VARCHAR(255) NOT NULL, PRIMARY KEY (owner))');
        $this->addSql("INSERT INTO contact_sync (home, books, checked_at, owner) SELECT home, '{}', NULL, owner FROM __temp__contact_sync");
        $this->addSql('DROP TABLE __temp__contact_sync');
    }
}
