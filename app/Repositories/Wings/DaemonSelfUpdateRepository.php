<?php

namespace Pterodactyl\Repositories\Wings;

use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\TransferException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * Lets a node replace its own Wings with a newer build. Needs the Wings of Stratosphere, which has /api/system/update.
 */
class DaemonSelfUpdateRepository extends DaemonRepository
{
    /**
     * @return array{current: string, latest?: string, arch?: string, error?: string}
     *
     * @throws DaemonConnectionException
     */
    public function info(): array
    {
        try {
            return json_decode((string) $this->getHttpClient()->get('/api/system/update', ['timeout' => 20])->getBody(), true) ?: [];
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }

    /**
     * Has the node download, check and start the newest build. The node answers first and restarts a second later.
     *
     * @return array{from: string, to: string, updated: bool}
     *
     * @throws DaemonConnectionException
     */
    public function update(): array
    {
        try {
            return json_decode((string) $this->getHttpClient()->post('/api/system/update', ['timeout' => 300])->getBody(), true) ?: [];
        } catch (ClientException $exception) {
            if ($exception->getResponse()->getStatusCode() === 404) {
                // Not a Wings of Stratosphere.
                return ['from' => '', 'to' => '', 'updated' => false, 'unsupported' => true];
            }
            $body = json_decode((string) $exception->getResponse()->getBody(), true);
            if (is_array($body) && isset($body['error'])) {
                return ['from' => '', 'to' => '', 'updated' => false, 'error' => (string) $body['error']];
            }
            throw new DaemonConnectionException($exception);
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }
}
