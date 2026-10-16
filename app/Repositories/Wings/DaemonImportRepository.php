<?php

namespace Pterodactyl\Repositories\Wings;

use Psr\Http\Message\ResponseInterface;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\TransferException;
use Webmozart\Assert\Assert;
use Pterodactyl\Models\Server;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * The server importer of the Wings of Stratosphere: the node connects to an SFTP or FTP server and copies a folder into the server.
 *
 * @method \Pterodactyl\Repositories\Wings\DaemonImportRepository setServer(\Pterodactyl\Models\Server $server)
 */
class DaemonImportRepository extends DaemonRepository
{
    /**
     * Connects and lists the top of the folder.
     *
     * @return array{fingerprint: string, entries: list<array{name: string, dir: bool, size: int}>, total: int}
     *
     * @throws DisplayException
     * @throws DaemonConnectionException
     */
    public function test(array $payload): array
    {
        Assert::isInstanceOf($this->server, Server::class);

        try {
            $response = $this->getHttpClient()->post(sprintf('/api/servers/%s/files/import/test', $this->server->uuid), ['json' => $payload, 'timeout' => 90]);
        } catch (ClientException $exception) {
            throw $this->explain($exception);
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }

        return json_decode((string) $response->getBody(), true) ?: [];
    }

    /**
     * Starts the import. The answer is a stream of JSON lines that ends when the import does.
     *
     * @throws DisplayException
     * @throws DaemonConnectionException
     */
    public function stream(array $payload): ResponseInterface
    {
        Assert::isInstanceOf($this->server, Server::class);

        try {
            return $this->getHttpClient()->post(
                sprintf('/api/servers/%s/files/import', $this->server->uuid),
                // Imports take as long as they take; the node says something at least every few seconds.
                ['json' => $payload, 'stream' => true, 'timeout' => 0, 'read_timeout' => 900]
            );
        } catch (ClientException $exception) {
            throw $this->explain($exception);
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }

    /** A refusal of the node, in its own words ("The host key of the server is ..."). A node without the importer has no such route. */
    private function explain(ClientException $exception): DisplayException
    {
        $status = $exception->getResponse()->getStatusCode();
        if ($status === 404) {
            return new DisplayException('This node does not have the server importer yet. Update Wings on the node (Admin > Updates).');
        }

        $body = json_decode((string) $exception->getResponse()->getBody(), true);
        $message = is_array($body) && !empty($body['error']) && is_string($body['error']) ? $body['error'] : 'The node refused the request (' . $status . ').';

        return new DisplayException($message);
    }
}
