<?php

namespace Pterodactyl\Repositories\Wings;

use GuzzleHttp\Exception\TransferException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * The certificate a node serves https with. Needs the forked Wings of Stratosphere, which has the /api/certificates route.
 */
class DaemonCertificateRepository extends DaemonRepository
{
    /**
     * What the node has now. A node without a certificate says so.
     *
     * @return array{present: bool, certificate?: array<string, mixed>}
     *
     * @throws DaemonConnectionException
     */
    public function info(): array
    {
        try {
            return json_decode((string) $this->getHttpClient()->get('/api/certificates')->getBody(), true) ?: ['present' => false];
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }

    /**
     * Gives the node a certificate (with the intermediates after it) and its private key. It uses them from the next connection on.
     *
     * @param  bool  $verify  whether the node has to prove who it is. False only for the first time, when the admin chose that: the
     *                        key is then given to whoever answers.
     * @return array{present: bool, certificate?: array<string, mixed>}
     *
     * @throws DaemonConnectionException
     */
    public function push(string $certificate, string $key, bool $verify): array
    {
        try {
            $response = $this->getHttpClient([], $verify)->post('/api/certificates', ['json' => ['certificate' => $certificate, 'key' => $key]]);

            return json_decode((string) $response->getBody(), true) ?: ['present' => true];
        } catch (TransferException $exception) {
            throw new DaemonConnectionException($exception);
        }
    }

    /**
     * Whether the node answers over https with a certificate that is trusted: the check before the panel starts to use https for it.
     */
    public function reachableOverHttps(): bool
    {
        try {
            $address = sprintf('https://%s:%d', $this->node->fqdn, $this->node->daemonListen);
            $this->getHttpClient([], true, $address)->get('/api/certificates');

            return true;
        } catch (TransferException) {
            return false;
        }
    }
}
