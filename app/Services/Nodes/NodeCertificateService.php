<?php

namespace Pterodactyl\Services\Nodes;

use Carbon\CarbonImmutable;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Facades\Activity;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonCertificateRepository;
use Pterodactyl\Repositories\Wings\DaemonConfigurationRepository;

/**
 * Gives the nodes the https certificate they serve their console and file transfers with. The certificates are the ones added under
 * Admin > Settings > Certificates; the node needs the forked Wings, which takes a certificate over its API and starts using it without a
 * restart. After the first time a node's certificate is renewed by the panel by itself.
 *
 * A private key is only given to a node whose identity the panel could check (https with a trusted certificate). The first time a node
 * has no such certificate yet, the admin has to confirm that it is given without that check, which is fine on a network they trust.
 */
class NodeCertificateService
{
    public function __construct(private DaemonCertificateRepository $wings, private DaemonConfigurationRepository $configuration)
    {
    }

    /** Whether a certificate is for this name: exactly, or a wildcard that covers it (one label, like in the certificate). */
    public static function covers(Certificate $certificate, string $fqdn): bool
    {
        $name = strtolower(rtrim($fqdn, '.'));

        foreach ($certificate->domains as $domain) {
            if ($domain === $name) {
                return true;
            }
            if (str_starts_with($domain, '*.') && ($dot = strpos($name, '.')) !== false && substr($name, $dot) === substr($domain, 1)) {
                return true;
            }
        }

        return false;
    }

    /** The certificate that is on and not expired and covers the node, the one that lasts longest. */
    public function candidate(Node $node): ?Certificate
    {
        return Certificate::query()->where('enabled', true)->where('not_after', '>', now())->orderByDesc('not_after')->get()
            ->first(fn (Certificate $certificate) => self::covers($certificate, $node->fqdn));
    }

    /** The certificate the node is meant to have: the one that was chosen, or the one that covers it when it follows those. */
    public function assigned(Node $node): ?Certificate
    {
        if ($node->certificate_id !== null) {
            return Certificate::query()->find($node->certificate_id);
        }

        return $node->certificate_auto ? $this->candidate($node) : null;
    }

    /**
     * What the node has now, as the node says it. An error is told instead of thrown: the page is for finding out what is wrong.
     *
     * @return array{present: bool, certificate?: array<string, mixed>, error?: string}
     */
    public function live(Node $node): array
    {
        try {
            return $this->wings->setNode($node)->info();
        } catch (\Throwable $exception) {
            return ['present' => false, 'error' => $exception->getMessage()];
        }
    }

    /**
     * @throws NodeCertificateException
     */
    public function push(Node $node, Certificate $certificate, bool $confirmUnverified = false): void
    {
        if ($certificate->isExpired()) {
            throw new NodeCertificateException('That certificate has expired.');
        }

        $this->wings->setNode($node);
        $verified = $node->scheme === 'https';
        $lastError = null;

        // First the way that is safe: the node has to prove who it is.
        if ($verified) {
            try {
                $this->send($node, $certificate, true);

                return;
            } catch (DisplayException $exception) {
                $lastError = $exception->getMessage();
            }
        }

        if (!$confirmUnverified) {
            $this->fail($node, $lastError ?? 'The node is reached over http.');

            throw new NodeCertificateException(
                $verified
                    ? 'The node could not be reached over https with a trusted certificate (' . $lastError . '). The first time this is normal: confirm that the certificate and its private key may be given to the node without checking who answers.'
                    : 'This node is reached over http, so the private key would be sent without any protection. Confirm that this is fine (it is on a network you trust).',
                true
            );
        }

        try {
            $this->send($node, $certificate, false);
        } catch (DisplayException $exception) {
            $this->fail($node, $exception->getMessage());

            throw new NodeCertificateException('The node did not take the certificate: ' . $exception->getMessage());
        }
    }

    /** @throws DisplayException */
    private function send(Node $node, Certificate $certificate, bool $verify): void
    {
        $this->wings->push($certificate->certificate, $certificate->private_key, $verify);

        $node->forceFill([
            'certificate_fingerprint' => $certificate->fingerprint,
            'certificate_pushed_at' => CarbonImmutable::now(),
            'certificate_error' => null,
        ])->save();

        Activity::event('node:certificate.push')->subject($node)->property(['certificate' => $certificate->name, 'verified' => $verify])->log();
    }

    private function fail(Node $node, string $message): void
    {
        $node->forceFill(['certificate_error' => mb_substr($message, 0, 500)])->save();
    }

    /**
     * Gives the node the certificate and switches the panel to https for it, when https works: the node answers over https with a
     * certificate that is trusted. Nothing is switched when it does not, the node stays as it was.
     *
     * @return array{switched: bool, message: string}
     *
     * @throws NodeCertificateException
     */
    public function enableHttps(Node $node, Certificate $certificate, bool $confirmUnverified = false): array
    {
        if (!self::covers($certificate, $node->fqdn)) {
            throw new NodeCertificateException('That certificate does not cover ' . $node->fqdn . ', browsers would not trust it for this node.');
        }

        $this->push($node, $certificate, $confirmUnverified);
        $this->wings->setNode($node);

        if ($node->scheme === 'https') {
            return ['switched' => false, 'message' => 'The node is on https already, it has the new certificate.'];
        }
        if (!$this->wings->reachableOverHttps()) {
            return ['switched' => false, 'message' => 'The certificate was given to the node, but the panel could not reach it over https at ' . $node->fqdn . ':' . $node->daemonListen . ' (is the port open, does the name point at the node?). Nothing was switched.'];
        }

        $node->forceFill(['scheme' => 'https'])->save();
        try {
            $this->configuration->setNode($node)->update($node);
        } catch (DisplayException $exception) {
            return ['switched' => true, 'message' => 'The panel now uses https for this node, but the node could not be told (' . $exception->getMessage() . '), it learns it when its configuration is updated.'];
        }

        return ['switched' => true, 'message' => 'The node serves https with the certificate and the panel uses it.'];
    }

    /** Saves the choice of certificate of a node (none, follow what covers it, or a certain one). */
    public function choose(Node $node, ?int $certificateId, bool $auto): void
    {
        $node->forceFill(['certificate_id' => $certificateId, 'certificate_auto' => $certificateId === null && $auto])->save();
    }

    /**
     * Pushes the certificates that changed (renewed, replaced, newly chosen) to the nodes that are meant to have them. Only over https
     * that is verified, in the background nothing is ever given to a node that could not prove who it is.
     *
     * @return array{pushed: int, failed: int}
     */
    public function syncAll(): array
    {
        $pushed = $failed = 0;

        Node::query()->where('scheme', 'https')->where(fn ($q) => $q->whereNotNull('certificate_id')->orWhere('certificate_auto', true))->each(function (Node $node) use (&$pushed, &$failed) {
            $certificate = $this->assigned($node);
            if ($certificate === null || $certificate->isExpired() || ($node->certificate_fingerprint === $certificate->fingerprint && $node->certificate_error === null)) {
                return;
            }

            try {
                $this->wings->setNode($node);
                $this->send($node, $certificate, true);
                ++$pushed;
            } catch (\Throwable $exception) {
                ++$failed;
                $this->fail($node, $exception->getMessage());
                Log::warning('Could not push a certificate to node ' . $node->id . ': ' . $exception->getMessage());
            }
        });

        return ['pushed' => $pushed, 'failed' => $failed];
    }
}
