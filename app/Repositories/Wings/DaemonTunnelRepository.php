<?php

namespace Pterodactyl\Repositories\Wings;

use GuzzleHttp\Exception\TransferException;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * @method \Pterodactyl\Repositories\Wings\DaemonTunnelRepository setNode(\Pterodactyl\Models\Node $node)
 */
class DaemonTunnelRepository extends DaemonRepository
{
    /**
     * Tells the node to look at which tunnels the panel wants (see Api\Remote\TunnelsController) and open or close them.
     *
     * @throws DaemonConnectionException
     */
    public function sync(): ResponseInterface
    {
        try {
            return $this->getHttpClient()->post('/api/tunnels/sync');
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }
}
