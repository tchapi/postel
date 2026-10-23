<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261023135333 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Per-user settings';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE user_settings (username VARCHAR(255) NOT NULL, from_name VARCHAR(200) DEFAULT NULL, signature CLOB DEFAULT NULL, load_remote_images BOOLEAN NOT NULL, density VARCHAR(20) NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (username))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE user_settings');
    }
}
