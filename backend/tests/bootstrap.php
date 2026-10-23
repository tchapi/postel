<?php

declare(strict_types=1);

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

// A fresh schema for the test database, once per run.
$kernel = new App\Kernel('test', true);
$kernel->boot();
$entityManager = $kernel->getContainer()->get('doctrine.orm.entity_manager');
$schema = new Doctrine\ORM\Tools\SchemaTool($entityManager);
$metadata = $entityManager->getMetadataFactory()->getAllMetadata();
$schema->dropSchema($metadata);
$schema->createSchema($metadata);
$kernel->shutdown();

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
