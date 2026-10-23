<?php

declare(strict_types=1);

namespace App\Compose;

use App\Security\RemoteUser;
use RuntimeException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

use function sprintf;

use const JSON_THROW_ON_ERROR;

/**
 * Attachments wait on disk between the upload and the send, per user, and
 * are forgotten after a day.
 */
final class UploadStore
{
    private const int TTL = 86400;

    public function __construct(
        #[Autowire('%app.data_dir%/uploads')]
        private readonly string $directory,
    ) {
    }

    public function store(RemoteUser $user, UploadedFile $file): Upload
    {
        $dir = $this->userDir($user);
        if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new RuntimeException(sprintf('Cannot create %s', $dir));
        }
        $this->sweep($dir);

        $id = bin2hex(random_bytes(16));
        $name = $file->getClientOriginalName();
        $upload = new Upload($id, '' === $name ? 'attachment' : $name, $file->getMimeType() ?? 'application/octet-stream', (int) $file->getSize());
        $file->move($dir, $id);
        file_put_contents($dir.'/'.$id.'.json', json_encode($upload, JSON_THROW_ON_ERROR));

        return $upload;
    }

    public function get(RemoteUser $user, string $id): Upload
    {
        $meta = $this->userDir($user).'/'.self::safeId($id).'.json';
        if (!is_file($meta)) {
            throw new NotFoundHttpException('No such upload');
        }
        /** @var array{id: string, name: string, mime: string, size: int} $data */
        $data = json_decode((string) file_get_contents($meta), true, flags: JSON_THROW_ON_ERROR);

        return new Upload($data['id'], $data['name'], $data['mime'], $data['size']);
    }

    public function path(RemoteUser $user, string $id): string
    {
        $path = $this->userDir($user).'/'.self::safeId($id);
        if (!is_file($path)) {
            throw new NotFoundHttpException('No such upload');
        }

        return $path;
    }

    public function delete(RemoteUser $user, string $id): void
    {
        $path = $this->userDir($user).'/'.self::safeId($id);
        @unlink($path);
        @unlink($path.'.json');
    }

    private function userDir(RemoteUser $user): string
    {
        return $this->directory.'/'.hash('sha256', $user->username);
    }

    private static function safeId(string $id): string
    {
        if (1 !== preg_match('/^[a-f0-9]{32}$/', $id)) {
            throw new NotFoundHttpException('No such upload');
        }

        return $id;
    }

    private function sweep(string $dir): void
    {
        $limit = time() - self::TTL;
        foreach (glob($dir.'/*.json') ?: [] as $meta) {
            if (filemtime($meta) < $limit) {
                @unlink(substr($meta, 0, -5));
                @unlink($meta);
            }
        }
    }
}
