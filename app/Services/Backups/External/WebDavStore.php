<?php

namespace Pterodactyl\Services\Backups\External;

use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Utils;
use GuzzleHttp\Exception\GuzzleException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\StreamInterface;
use Pterodactyl\Exceptions\DisplayException;

/** A WebDAV server (Nextcloud, ownCloud, a NAS, Apache or nginx with dav). */
class WebDavStore implements BackupStore
{
    private Client $http;

    public function __construct(private string $url, string $user = '', string $password = '', ?Client $http = null)
    {
        $this->url = rtrim($url, '/');
        $this->http = $http ?? new Client([
            'auth' => $user !== '' ? [$user, $password] : null,
            // A backup can take a long time to send, the connection is only given a short time to start.
            'timeout' => 0,
            'connect_timeout' => 20,
            'http_errors' => false,
        ]);
    }

    private function url(string $path): string
    {
        return $this->url . '/' . implode('/', array_map('rawurlencode', array_filter(explode('/', $path), fn ($p) => $p !== '')));
    }

    /** @param  array<string, mixed>  $options */
    private function send(string $method, string $path, array $options = []): ResponseInterface
    {
        try {
            return $this->http->request($method, $this->url($path), $options + ['http_errors' => false]);
        } catch (GuzzleException $exception) {
            throw new DisplayException('Could not reach the WebDAV server: ' . $exception->getMessage());
        }
    }

    private function fail(ResponseInterface $response, string $doing): never
    {
        $hint = match ($response->getStatusCode()) {
            401, 403 => ' (the user name or password is not accepted, or the user may not write here)',
            404 => ' (the folder is not there)',
            507 => ' (the server is full)',
            default => '',
        };

        throw new DisplayException(sprintf('The WebDAV server answered %d when %s%s.', $response->getStatusCode(), $doing, $hint));
    }

    /** Makes the folders of a path, one level at a time (a WebDAV server makes only the last one). */
    private function makeFolders(string $path): void
    {
        $parts = array_values(array_filter(explode('/', dirname($path)), fn ($p) => $p !== '' && $p !== '.'));
        $built = '';
        foreach ($parts as $part) {
            $built .= '/' . $part;
            $response = $this->send('MKCOL', $built . '/');
            // 201 made, 405 is already there, 301 and 200 are servers that say so differently.
            if (!in_array($response->getStatusCode(), [200, 201, 204, 301, 405], true)) {
                $this->fail($response, 'making the folder ' . $built);
            }
        }
    }

    public function put(string $path, StreamInterface $contents, ?int $size = null): void
    {
        $this->makeFolders($path);
        $response = $this->send('PUT', $path, ['body' => $contents]);
        if (!in_array($response->getStatusCode(), [200, 201, 204], true)) {
            $this->fail($response, 'saving the backup');
        }
    }

    public function read(string $path): StreamInterface
    {
        $response = $this->send('GET', $path, ['stream' => true]);
        if ($response->getStatusCode() !== 200) {
            $this->fail($response, 'getting the backup');
        }

        return $response->getBody();
    }

    public function delete(string $path): void
    {
        $response = $this->send('DELETE', $path);
        if (!in_array($response->getStatusCode(), [200, 202, 204, 404], true)) {
            $this->fail($response, 'deleting the backup');
        }
    }

    public function temporaryUrl(string $path, int $minutes): ?string
    {
        return null;
    }

    public function check(): void
    {
        $name = '.check-' . bin2hex(random_bytes(4));
        $this->put($name, Utils::streamFor('ok'));
        $got = (string) $this->read($name);
        $this->delete($name);
        if ($got !== 'ok') {
            throw new DisplayException('What was written was not read back the same.');
        }
    }
}
