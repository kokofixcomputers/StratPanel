<?php

namespace Pterodactyl\Repositories\Wings;

use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\TransferException;
use Webmozart\Assert\Assert;
use Pterodactyl\Models\Server;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * The background jobs of the Wings of Stratosphere: imports, archives and downloads that go on when nobody watches.
 *
 * @method \Pterodactyl\Repositories\Wings\DaemonJobRepository setServer(\Pterodactyl\Models\Server $server)
 */
class DaemonJobRepository extends DaemonRepository
{
    /**
     * The jobs of the server, the newest first.
     *
     * @return list<array<string, mixed>>
     *
     * @throws DisplayException
     * @throws DaemonConnectionException
     */
    public function list(): array
    {
        return $this->call('GET', '')['data'] ?? [];
    }

    /**
     * One job, null when the node does not know it.
     *
     * @return array<string, mixed>|null
     */
    public function show(string $id): ?array
    {
        try {
            return $this->call('GET', '/' . rawurlencode($id));
        } catch (DisplayException $exception) {
            if ($exception->getCode() === 404) {
                return null;
            }

            throw $exception;
        }
    }

    /**
     * Starts a job: type is import, compress, decompress or pull.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed> the job
     */
    public function start(string $type, array $payload): array
    {
        return $this->call('POST', '/' . $type, $payload);
    }

    /** Cancels a job that is going, forgets one that is over. */
    public function cancel(string $id): void
    {
        $this->call('DELETE', '/' . rawurlencode($id));
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>
     */
    private function call(string $method, string $suffix, ?array $payload = null): array
    {
        Assert::isInstanceOf($this->server, Server::class);

        try {
            $response = $this->getHttpClient()->request($method, sprintf('/api/servers/%s/jobs%s', $this->server->uuid, $suffix), array_filter([
                'json' => $payload,
                'timeout' => 90,
            ], fn ($value) => !is_null($value)));
        } catch (ClientException $exception) {
            $status = $exception->getResponse()->getStatusCode();
            if ($status === 404 && $suffix === '') {
                // The route of the list: not a node with jobs.
                throw new DisplayException('This node does not have background jobs yet. Update Wings on the node (Admin > Updates).', null, DisplayException::LEVEL_ERROR, 400);
            }
            $body = json_decode((string) $exception->getResponse()->getBody(), true);
            $message = is_array($body) && !empty($body['error']) && is_string($body['error']) ? $body['error'] : 'The node refused the request (' . $status . ').';

            throw new DisplayException($message, null, DisplayException::LEVEL_ERROR, $status === 404 ? 404 : 400);
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }

        return json_decode((string) $response->getBody(), true) ?: [];
    }
}
