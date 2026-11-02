<?php

namespace Pterodactyl\Repositories\Wings;

use GuzzleHttp\Exception\TransferException;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * @method \Pterodactyl\Repositories\Wings\DaemonPrivateNetworkRepository setNode(\Pterodactyl\Models\Node $node)
 */
class DaemonPrivateNetworkRepository extends DaemonRepository
{
    /**
     * Tells the node to look at what the private network should be (see Api\Remote\PrivateNetworkController).
     *
     * @throws DaemonConnectionException
     */
    public function sync(): ResponseInterface
    {
        try {
            return $this->getHttpClient()->post('/api/private-network/sync');
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }
}
