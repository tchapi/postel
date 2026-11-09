<?php

declare(strict_types=1);

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

// A fresh schema for the test database, once per run.
$kernel = new App\Kernel('test', true);
$kernel->boot();
$entityManager = $kernel->getContainer()->get('doctrine.orm.entity_manager');
// var/ is not versioned, so a fresh checkout has no folder for the SQLite file yet
$url = str_replace('%kernel.project_dir%', dirname(__DIR__), $_SERVER['DATABASE_URL'] ?? '');
if (str_starts_with($url, 'sqlite:///') && !is_dir($dir = dirname(substr($url, strlen('sqlite:///'))))) {
    mkdir($dir, 0777, true);
}
$schema = new Doctrine\ORM\Tools\SchemaTool($entityManager);
$metadata = $entityManager->getMetadataFactory()->getAllMetadata();
$schema->dropSchema($metadata);
$schema->createSchema($metadata);
$kernel->shutdown();

if ($_SERVER['APP_DEBUG'] ?? false) {
    umask(0000);
}
