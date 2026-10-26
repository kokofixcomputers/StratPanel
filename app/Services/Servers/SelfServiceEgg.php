<?php

namespace Pterodactyl\Services\Servers;

use Pterodactyl\Models\Egg;
use Pterodactyl\Exceptions\DisplayException;

/**
 * The egg the servers people make for themselves are built from (the creation wizard, and the parts split off a server): the one the admin
 * chose, otherwise a plain Java egg. The Versions tab installs the actual software afterwards, so the egg itself is only the starting point.
 */
class SelfServiceEgg
{
    /**
     * Picks the docker image with the highest Java version, falling back to the first one listed.
     *
     * @param array<string, string> $images
     */
    public function newestJavaImage(array $images): string
    {
        $best = null;
        $bestVersion = -1;
        foreach ($images as $image) {
            if (preg_match('/java[_:-]?(\d+)/i', (string) $image, $matches) && (int) $matches[1] > $bestVersion) {
                $bestVersion = (int) $matches[1];
                $best = $image;
            }
        }

        return $best ?? (string) (reset($images) ?: '');
    }

    /**
     * Finds the egg new servers are created from. A plain "Java" egg is preferred, the Versions tab installs the
     * actual software afterwards so any Minecraft egg also works as the starting point.
     *
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    public function resolve(mixed $configured): Egg
    {
        $query = Egg::query()->with('variables');

        if (!empty($configured)) {
            $egg = (clone $query)->find((int) $configured);
            if (!is_null($egg)) {
                return $egg;
            }
        }

        foreach (['Java', 'Paper', 'Vanilla'] as $name) {
            $egg = (clone $query)->where('name', 'like', "%$name%")->first();
            if (!is_null($egg)) {
                return $egg;
            }
        }

        $egg = (clone $query)->whereHas('nest', function ($nest) {
            $nest->where('name', 'like', '%Minecraft%');
        })->first();

        if (is_null($egg)) {
            throw new DisplayException('No Minecraft egg is available to create a server with, ask an administrator to import one.');
        }

        return $egg;
    }
}
