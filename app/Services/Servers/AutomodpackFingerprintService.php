<?php

namespace Pterodactyl\Services\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;

/**
 * The fingerprint of the certificate AutoModpack hosts its files with. Players check it the first time they join, so the panel shows it next
 * to the address. AutoModpack only writes it to the log when it starts, so it is found there once and kept in stratosphere.json, in the
 * root of the server, where the panel keeps what it learns about a server.
 */
class AutomodpackFingerprintService
{
    public const FILE = '/stratosphere.json';

    public const LOG = '/logs/latest.log';

    public const PATTERN = '/AutoModpack host certificate fingerprint:\s*([0-9a-f]{64})/i';

    // The log is read whole, one that is bigger than this is not looked through.
    private const MAX_LOG = 8 * 1024 * 1024;

    public function __construct(private DaemonFileRepository $files)
    {
    }

    /**
     * What is known: the kept fingerprint, looked for in the log when there is none (or always with $scan, because a certificate that was
     * made again has a new one).
     *
     * @return array{fingerprint: string|null, found_at: string|null}
     */
    public function get(Server $server, bool $scan = false): array
    {
        $files = $this->files->setServer($server);
        $document = $this->document($server);
        $kept = $document['automodpack']['fingerprint'] ?? null;
        $kept = is_string($kept) && preg_match('/^[0-9a-f]{64}$/i', $kept) ? strtolower($kept) : null;

        if ($kept !== null && !$scan) {
            return ['fingerprint' => $kept, 'found_at' => $document['automodpack']['foundAt'] ?? null];
        }

        $found = $this->fromLog($server);
        if ($found === null || $found === $kept) {
            return ['fingerprint' => $kept, 'found_at' => $kept !== null ? ($document['automodpack']['foundAt'] ?? null) : null];
        }

        $document['automodpack'] = array_merge((array) ($document['automodpack'] ?? []), ['fingerprint' => $found, 'foundAt' => now()->toIso8601String()]);
        try {
            $files->putContent(self::FILE, json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } catch (\Throwable $exception) {
            // Showing it does not depend on keeping it.
            Log::warning('Could not keep the AutoModpack fingerprint of ' . $server->uuid . ': ' . $exception->getMessage());
        }

        return ['fingerprint' => $found, 'found_at' => $document['automodpack']['foundAt']];
    }

    /** @return array<string, mixed> */
    private function document(Server $server): array
    {
        try {
            $data = json_decode($this->files->setServer($server)->getContent(self::FILE, 1024 * 1024), true);
        } catch (\Throwable) {
            return [];
        }

        return is_array($data) && !array_is_list($data) ? $data : [];
    }

    /** The last fingerprint the log says. */
    private function fromLog(Server $server): ?string
    {
        try {
            $log = $this->files->setServer($server)->getContent(self::LOG, self::MAX_LOG);
        } catch (\Throwable) {
            return null;
        }

        return preg_match_all(self::PATTERN, $log, $matches) > 0 ? strtolower(end($matches[1])) : null;
    }
}
