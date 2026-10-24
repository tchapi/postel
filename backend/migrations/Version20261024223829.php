<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261024223829 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Muted accents: old accent names move to their closest new one';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TEMPORARY TABLE __temp__user_settings AS SELECT username, from_name, signature, load_remote_images, density, updated_at, threads, language, accent, allowed_senders FROM user_settings');
        $this->addSql('DROP TABLE user_settings');
        $this->addSql('CREATE TABLE user_settings (username VARCHAR(255) NOT NULL, from_name VARCHAR(200) DEFAULT NULL, signature CLOB DEFAULT NULL, load_remote_images BOOLEAN NOT NULL, density VARCHAR(20) NOT NULL, updated_at DATETIME NOT NULL, threads BOOLEAN DEFAULT 1 NOT NULL, language VARCHAR(5) DEFAULT \'en\' NOT NULL, accent VARCHAR(20) DEFAULT \'iris\' NOT NULL, allowed_senders CLOB DEFAULT \'[]\' NOT NULL, PRIMARY KEY (username))');
        $this->addSql('INSERT INTO user_settings (username, from_name, signature, load_remote_images, density, updated_at, threads, language, accent, allowed_senders) SELECT username, from_name, signature, load_remote_images, density, updated_at, threads, language, accent, allowed_senders FROM __temp__user_settings');
        $this->addSql('DROP TABLE __temp__user_settings');
        $this->addSql("UPDATE user_settings SET accent = CASE accent WHEN 'violet' THEN 'iris' WHEN 'persimmon' THEN 'clay' WHEN 'berry' THEN 'rose' WHEN 'plum' THEN 'rose' WHEN 'jade' THEN 'teal' ELSE accent END");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("UPDATE user_settings SET accent = CASE accent WHEN 'iris' THEN 'violet' WHEN 'clay' THEN 'persimmon' WHEN 'rose' THEN 'berry' WHEN 'teal' THEN 'jade' WHEN 'ocean' THEN 'ocean' ELSE 'violet' END");
        $this->addSql('CREATE TEMPORARY TABLE __temp__user_settings AS SELECT username, from_name, signature, load_remote_images, density, threads, language, accent, allowed_senders, updated_at FROM user_settings');
        $this->addSql('DROP TABLE user_settings');
        $this->addSql('CREATE TABLE user_settings (username VARCHAR(255) NOT NULL, from_name VARCHAR(200) DEFAULT NULL, signature CLOB DEFAULT NULL, load_remote_images BOOLEAN NOT NULL, density VARCHAR(20) NOT NULL, threads BOOLEAN DEFAULT 1 NOT NULL, language VARCHAR(5) DEFAULT \'en\' NOT NULL, accent VARCHAR(20) DEFAULT \'violet\' NOT NULL, allowed_senders CLOB DEFAULT \'[]\' NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (username))');
        $this->addSql('INSERT INTO user_settings (username, from_name, signature, load_remote_images, density, threads, language, accent, allowed_senders, updated_at) SELECT username, from_name, signature, load_remote_images, density, threads, language, accent, allowed_senders, updated_at FROM __temp__user_settings');
        $this->addSql('DROP TABLE __temp__user_settings');
    }
}
