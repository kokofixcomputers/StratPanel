<?php

namespace Pterodactyl\Services\Backups\External;

use Aws\S3\S3Client;
use Aws\S3\ObjectUploader;
use Aws\Exception\AwsException;
use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;
use Pterodactyl\Exceptions\DisplayException;

/** Amazon S3, or anything that speaks S3 (Backblaze B2, Wasabi, MinIO, Cloudflare R2, DigitalOcean Spaces). */
class S3Store implements BackupStore
{
    public function __construct(private S3Client $client, private string $bucket, private string $prefix = '')
    {
        $this->prefix = trim($prefix, '/');
    }

    /** @param  array<string, mixed>  $config */
    public static function fromConfig(array $config): self
    {
        $options = [
            'version' => 'latest',
            'region' => ($config['region'] ?? '') ?: 'us-east-1',
            'credentials' => ['key' => (string) ($config['key'] ?? ''), 'secret' => (string) ($config['secret'] ?? '')],
            'use_path_style_endpoint' => !empty($config['path_style']),
        ];
        if (!empty($config['endpoint'])) {
            $options['endpoint'] = $config['endpoint'];
        }

        return new self(new S3Client($options), (string) ($config['bucket'] ?? ''), (string) ($config['prefix'] ?? ''));
    }

    private function key(string $path): string
    {
        return ($this->prefix !== '' ? $this->prefix . '/' : '') . ltrim($path, '/');
    }

    /** @template T @param  callable(): T  $call @return T */
    private function run(callable $call, string $doing): mixed
    {
        try {
            return $call();
        } catch (AwsException $exception) {
            throw new DisplayException(sprintf('S3 refused %s: %s', $doing, $exception->getAwsErrorMessage() ?: $exception->getAwsErrorCode() ?: $exception->getMessage()));
        }
    }

    public function put(string $path, StreamInterface $contents, ?int $size = null): void
    {
        // Large files are sent in parts, a stream whose size is not known is fine.
        $this->run(fn () => (new ObjectUploader($this->client, $this->bucket, $this->key($path), $contents, 'private', ['concurrency' => 1]))->upload(), 'saving the backup');
    }

    public function read(string $path): StreamInterface
    {
        return $this->run(fn () => $this->client->getObject(['Bucket' => $this->bucket, 'Key' => $this->key($path)])['Body'], 'getting the backup');
    }

    public function delete(string $path): void
    {
        $this->run(fn () => $this->client->deleteObject(['Bucket' => $this->bucket, 'Key' => $this->key($path)]), 'deleting the backup');
    }

    public function temporaryUrl(string $path, int $minutes): ?string
    {
        $command = $this->client->getCommand('GetObject', [
            'Bucket' => $this->bucket,
            'Key' => $this->key($path),
            'ResponseContentType' => 'application/x-gzip',
        ]);

        return (string) $this->client->createPresignedRequest($command, '+' . $minutes . ' minutes')->getUri();
    }

    public function check(): void
    {
        if ($this->bucket === '') {
            throw new DisplayException('Give the name of the bucket.');
        }
        $name = '.check-' . bin2hex(random_bytes(4));
        $this->put($name, Utils::streamFor('ok'));
        $got = (string) $this->read($name);
        $this->delete($name);
        if ($got !== 'ok') {
            throw new DisplayException('What was written was not read back the same.');
        }
    }
}
