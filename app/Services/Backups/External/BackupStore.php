<?php

namespace Pterodactyl\Services\Backups\External;

use Psr\Http\Message\StreamInterface;

/** A place outside the node that keeps backup files. A path is `<server uuid>/<backup uuid>.tar.gz`. */
interface BackupStore
{
    /** Writes the file, streaming it, so a large backup is never held in memory. */
    public function put(string $path, StreamInterface $contents, ?int $size = null): void;

    /** Reads the file as a stream. */
    public function read(string $path): StreamInterface;

    /** Removes the file, a file that is not there is fine. */
    public function delete(string $path): void;

    /** A link that downloads the file without logging in, when the place can make one (S3). */
    public function temporaryUrl(string $path, int $minutes): ?string;

    /**
     * Checks that files can be written, read and removed with these settings.
     *
     * @throws \Throwable with a message that says what is wrong
     */
    public function check(): void;
}
