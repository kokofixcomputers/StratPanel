<?php

namespace Pterodactyl\Http\Middleware\Api\Client\Server;

use Illuminate\Http\Request;
use Pterodactyl\Services\Trash\TrashService;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The folder of the trash bin is looked after by the trash bin: whatever the file manager is asked, it does not exist. Without this
 * somebody who can rename files could move things out of other people's trash, or fill the folder with things that are never deleted.
 */
class ProtectTrashFolder
{
    private const FIELDS = ['directory', 'file', 'location', 'root', 'name', 'path', 'destination'];

    public function __construct(private TrashService $trash)
    {
    }

    public function handle(Request $request, \Closure $next): mixed
    {
        $root = is_string($request->input('root')) ? $request->input('root') : '';

        foreach ($this->paths($request, $root) as $path) {
            if ($this->trash->isTrashPath($path)) {
                throw new NotFoundHttpException('The file or folder was not found.');
            }
        }

        return $next($request);
    }

    /** @return list<string> every path the request mentions, from the root of the server */
    private function paths(Request $request, string $root): array
    {
        $paths = [];
        foreach (self::FIELDS as $field) {
            if (is_string($value = $request->input($field))) {
                $paths[] = $value;
            }
        }

        foreach ((array) $request->input('files', []) as $entry) {
            // A name (delete, compress) or a pair of names (rename: from and to, the second may climb out with "..").
            foreach (is_array($entry) ? $entry : [$entry] as $name) {
                if (is_string($name)) {
                    $paths[] = $root . '/' . $name;
                }
            }
        }

        return $paths;
    }
}
