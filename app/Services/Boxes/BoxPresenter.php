<?php

namespace Pterodactyl\Services\Boxes;

use Pterodactyl\Models\Box;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\StorePackage;
use Pterodactyl\Models\StoreOrderItem;

/** A box as the pages show it: what it holds, what is used and left, and the servers in it. */
final class BoxPresenter
{
    /** @return array<string, mixed> */
    public static function summary(Box $box): array
    {
        $boxes = app(BoxService::class);

        return [
            'id' => $box->uuid,
            'admin_id' => $box->id,
            'name' => $box->name,
            'status' => $box->status,
            'source' => $box->source,
            'expires_at' => $box->expires_at?->toIso8601String(),
            'notes' => $box->notes,
            'node' => $box->node ? ['id' => $box->node->id, 'name' => $box->node->name] : null,
            'owner' => $box->user ? ['id' => $box->user->id, 'username' => $box->user->username, 'email' => $box->user->email] : null,
            'limits' => $boxes->limits($box),
            'used' => $boxes->used($box),
            'remaining' => $boxes->remaining($box),
            'servers' => (int) ($box->servers_count ?? $box->servers()->count()),
            'can_create' => $boxes->canCreateServer($box),
        ];
    }

    /** @return array<string, mixed> */
    public static function detail(Box $box): array
    {
        $boxes = app(BoxService::class);
        $box->loadMissing(['user', 'node']);

        return self::summary($box) + [
            'minimum' => BoxService::MINIMUM,
            'servers_list' => $box->servers()->with(['node', 'allocation'])->orderBy('id')->get()->map(fn (Server $s) => self::server($s))->values()->all(),
            'nodes' => $boxes->nodes($box)->map(fn ($node) => [
                'id' => $node->id,
                'name' => $node->name,
                'location' => $node->location?->short,
                // @phpstan-ignore-next-line property.notFound
                'free_allocations' => (int) $node->free_allocations,
            ])->values()->all(),
            // What lengthens the box when it was bought: the package it came from.
            'renew' => self::renew($box),
        ];
    }

    /** @return array<string, mixed> */
    public static function server(Server $s): array
    {
        return [
            'id' => config('pterodactyl.features.new_server_identifiers') ? $s->identifier : $s->uuidShort,
            'uuid' => $s->uuid,
            'admin_id' => $s->id,
            'name' => $s->name,
            'status' => $s->status,
            'node' => $s->node?->name,
            'address' => $s->allocation ? (($s->allocation->alias ?: $s->allocation->ip) . ':' . $s->allocation->port) : null,
            'limits' => [
                'memory' => (int) $s->memory,
                'disk' => (int) $s->disk,
                'cpu' => (int) $s->cpu,
                'allocations' => (int) $s->allocation_limit,
                'backups' => (int) $s->backup_limit,
                'databases' => (int) $s->database_limit,
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    private static function renew(Box $box): ?array
    {
        if ($box->source !== 'order') {
            return null;
        }
        $item = StoreOrderItem::query()->with('order')->where('box_id', $box->id)->where('renewal', false)->orderBy('id')->first();
        $package = $item?->package_id ? StorePackage::query()->find($item->package_id) : null;
        if (!$package || !$package->period_days) {
            return null;
        }

        return ['package' => $package->uuid, 'name' => $package->name, 'price' => $package->price, 'period_days' => $package->period_days, 'currency' => $item->order->currency];
    }
}
