<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns;

use Illuminate\Pagination\LengthAwarePaginator;
use Pterodactyl\Exceptions\DisplayException;

/** What the controllers of the admin API have in common. */
trait FormatsAdminResponses
{
    /**
     * The numbers of a page of a list, in the shape the app reads (see getPaginationSet in resources/scripts/api/http.ts).
     *
     * @return array{total: int, count: int, per_page: int, current_page: int, total_pages: int}
     */
    protected function pagination(LengthAwarePaginator $paginator): array
    {
        return [
            'total' => $paginator->total(),
            'count' => $paginator->count(),
            'per_page' => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'total_pages' => $paginator->lastPage(),
        ];
    }

    /**
     * Runs something that talks to a database server of somebody else (a database host, a node) and says what its error was when it
     * fails, the way the pages of the admin area always did: that is the one thing the person can act on.
     *
     * @template T
     *
     * @param  \Closure(): T  $work
     * @return T
     *
     * @throws DisplayException
     * @throws \Throwable
     */
    protected function sayDatabaseErrors(\Closure $work): mixed
    {
        try {
            return $work();
        } catch (\Exception $exception) {
            if ($exception instanceof \PDOException || $exception->getPrevious() instanceof \PDOException) {
                throw new DisplayException(sprintf('There was an error while trying to connect to the host or while executing a query: "%s"', $exception->getMessage()));
            }

            throw $exception;
        }
    }
}
