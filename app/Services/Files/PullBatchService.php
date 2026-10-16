<?php

namespace Pterodactyl\Services\Files;

use GuzzleHttp\Promise\Each;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Exception\RequestException;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;

/**
 * Downloads a list of files to a server in one go, three at a time (the most a node lets a server do at once), and tells after every
 * file how far it got. One request from the browser instead of one for each file, so a modpack of hundreds of mods does not run into
 * the limits on requests, and failures are tried again here, where the reason is known.
 */
class PullBatchService
{
    /** Wings refuses more than three downloads at once for a server. */
    public const CONCURRENCY = 3;

    /** Microseconds to wait before trying a failed file again (times the number of the attempt), and when the node is busy. */
    public int $retryWait = 1_000_000;

    public int $busyWait = 2_000_000;

    public function __construct(private DaemonFileRepository $files)
    {
    }

    /**
     * @param  list<array{url: string, directory?: string|null, filename?: string|null}>  $items
     * @param  callable(array<string, mixed>): void  $emit  gets {"total"}, then one line for each file ({"done", "total", "index", "ok", "error"?}), then {"finished"}
     * @param  (callable(): bool)|null  $aborted  true when nobody is listening any more, nothing new is started then
     * @return array{done: int, failed: int}
     */
    public function run(Server $server, array $items, callable $emit, ?callable $aborted = null): array
    {
        $repository = $this->files->setServer($server);
        $total = count($items);
        $done = 0;
        $failed = 0;

        $emit(['total' => $total]);

        $promises = (function () use ($items, $repository, $aborted, $total, &$done, &$failed, $emit) {
            foreach ($items as $index => $item) {
                if ($aborted !== null && $aborted()) {
                    return;
                }

                yield $index => $this->attempt($repository, $item)->then(
                    function () use ($index, $total, &$done, $emit) {
                        $emit(['done' => ++$done, 'total' => $total, 'index' => $index, 'ok' => true]);
                    },
                    function (\Throwable $error) use ($index, $total, &$done, &$failed, $emit) {
                        ++$failed;
                        $emit(['done' => ++$done, 'total' => $total, 'index' => $index, 'ok' => false, 'error' => $error->getMessage()]);
                    }
                );
            }
        })();

        Each::ofLimit($promises, self::CONCURRENCY)->wait();

        $emit(['finished' => true, 'done' => $done, 'failed' => $failed]);

        return ['done' => $done, 'failed' => $failed];
    }

    /** Downloads one file. A node that is busy is waited for, anything else is tried three times. */
    private function attempt(DaemonFileRepository $repository, array $item, int $try = 1, int $busy = 0): PromiseInterface
    {
        return $repository->pullAsync((string) $item['url'], $item['directory'] ?? null, $item['filename'] ?? null)->then(null, function (\Throwable $error) use ($repository, $item, $try, $busy) {
            $message = self::message($error);

            if (str_contains($message, 'simultaneous') && $busy < 30) {
                usleep($this->busyWait);

                return $this->attempt($repository, $item, $try, $busy + 1);
            }
            if ($try < 3) {
                usleep($this->retryWait * $try);

                return $this->attempt($repository, $item, $try + 1, $busy);
            }

            throw new \RuntimeException($message, 0, $error);
        });
    }

    /** What the node said, as one sentence. */
    public static function message(\Throwable $error): string
    {
        if ($error instanceof RequestException && $error->hasResponse()) {
            $body = json_decode((string) $error->getResponse()->getBody(), true);
            if (is_array($body)) {
                foreach (['message', 'error'] as $key) {
                    if (!empty($body[$key]) && is_string($body[$key])) {
                        return $body[$key];
                    }
                }
            }

            return 'The node answered ' . $error->getResponse()->getStatusCode() . '.';
        }

        return 'The node could not be reached.';
    }
}
