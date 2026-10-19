<?php

namespace Pterodactyl\Services\Dns;

use Pterodactyl\Models\DnsZone;

/** The DNS providers the panel can make records at, and what an admin has to give for each. */
final class DnsProviders
{
    /**
     * @return array<string, array{name: string, class: class-string<DnsProvider>, fields: array<string, array{label: string, secret: bool, required: bool, help: string}>, help: string}>
     */
    public static function types(): array
    {
        return [
            'cloudflare' => [
                'name' => 'Cloudflare',
                'class' => CloudflareProvider::class,
                'fields' => [
                    'api_token' => [
                        'label' => 'API token',
                        'secret' => true,
                        'required' => true,
                        'help' => 'Create one at dash.cloudflare.com > My Profile > API Tokens > Create Token with "Edit zone DNS", and limit it to this domain.',
                    ],
                    'zone_id' => [
                        'label' => 'Zone ID',
                        'secret' => false,
                        'required' => false,
                        'help' => 'Leave empty: it is found by the name of the domain.',
                    ],
                ],
                'help' => 'The records are made without the Cloudflare proxy (grey cloud), because Minecraft is not web traffic.',
            ],
        ];
    }

    public static function make(DnsZone $zone): DnsProvider
    {
        $type = self::types()[$zone->type] ?? throw new DnsException("Unknown DNS provider {$zone->type}.");

        return app($type['class']);
    }
}
