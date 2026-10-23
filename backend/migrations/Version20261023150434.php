<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261023150434 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Accent, language and senders allowed to load images';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE user_settings ADD COLUMN language VARCHAR(5) DEFAULT \'en\' NOT NULL');
        $this->addSql('ALTER TABLE user_settings ADD COLUMN accent VARCHAR(20) DEFAULT \'violet\' NOT NULL');
        $this->addSql('ALTER TABLE user_settings ADD COLUMN allowed_senders CLOB DEFAULT \'[]\' NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('CREATE TEMPORARY TABLE __temp__user_settings AS SELECT username, from_name, signature, load_remote_images, density, threads, updated_at FROM user_settings');
        $this->addSql('DROP TABLE user_settings');
        $this->addSql('CREATE TABLE user_settings (username VARCHAR(255) NOT NULL, from_name VARCHAR(200) DEFAULT NULL, signature CLOB DEFAULT NULL, load_remote_images BOOLEAN NOT NULL, density VARCHAR(20) NOT NULL, threads BOOLEAN DEFAULT 1 NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (username))');
        $this->addSql('INSERT INTO user_settings (username, from_name, signature, load_remote_images, density, threads, updated_at) SELECT username, from_name, signature, load_remote_images, density, threads, updated_at FROM __temp__user_settings');
        $this->addSql('DROP TABLE __temp__user_settings');
    }
}
