<?php

namespace Pterodactyl\Services\PrivateNetwork;

/** The little bit of IPv4 arithmetic the private network needs: ranges like 10.99.0.0/16 cut into /24 slices of addresses. */
final class Cidr
{
    /** The private ranges of RFC 1918, and the one for carrier grade NAT (what Tailscale uses). */
    private const PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10'];

    /** @return array{0: int, 1: int}|null the first address and the number of bits of the prefix, null when it is not a range */
    public static function parse(string $cidr): ?array
    {
        if (!preg_match('/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/', trim($cidr), $m)) {
            return null;
        }
        foreach ([1, 2, 3, 4] as $i) {
            if ((int) $m[$i] > 255) {
                return null;
            }
        }
        $bits = (int) $m[5];
        if ($bits < 0 || $bits > 32) {
            return null;
        }
        $address = (((int) $m[1]) << 24) | (((int) $m[2]) << 16) | (((int) $m[3]) << 8) | (int) $m[4];

        return [$address & self::mask($bits), $bits];
    }

    public static function mask(int $bits): int
    {
        return $bits === 0 ? 0 : (0xFFFFFFFF << (32 - $bits)) & 0xFFFFFFFF;
    }

    public static function toIp(int $address): string
    {
        return implode('.', [($address >> 24) & 255, ($address >> 16) & 255, ($address >> 8) & 255, $address & 255]);
    }

    public static function toInt(string $ip): ?int
    {
        $long = ip2long(trim($ip));

        return $long === false ? null : $long & 0xFFFFFFFF;
    }

    /** The range as text, with the host bits dropped: 10.99.3.7/16 is 10.99.0.0/16. */
    public static function normalize(string $cidr): ?string
    {
        $parsed = self::parse($cidr);

        return $parsed === null ? null : self::toIp($parsed[0]) . '/' . $parsed[1];
    }

    public static function contains(string $cidr, string $ip): bool
    {
        $parsed = self::parse($cidr);
        $address = self::toInt($ip);

        return $parsed !== null && $address !== null && ($address & self::mask($parsed[1])) === $parsed[0];
    }

    /** Whether a range is inside one of the private ranges, which is where a private network has to be. */
    public static function isPrivate(string $cidr): bool
    {
        $parsed = self::parse($cidr);
        if ($parsed === null) {
            return false;
        }
        foreach (self::PRIVATE as $private) {
            [$base, $bits] = self::parse($private);
            if ($parsed[1] >= $bits && ($parsed[0] & self::mask($bits)) === $base) {
                return true;
            }
        }

        return false;
    }

    /** Whether two ranges share an address. */
    public static function overlaps(string $a, string $b): bool
    {
        $x = self::parse($a);
        $y = self::parse($b);
        if ($x === null || $y === null) {
            return false;
        }
        $bits = min($x[1], $y[1]);

        return ($x[0] & self::mask($bits)) === ($y[0] & self::mask($bits));
    }

    /** How many /24 slices a range has, which is how many nodes it can serve. 0 for a range smaller than a /24. */
    public static function slices(string $cidr): int
    {
        $parsed = self::parse($cidr);

        return $parsed === null || $parsed[1] > 24 ? 0 : 1 << (24 - $parsed[1]);
    }

    /** The slice of a range at a position, like 10.99.3.0/24 for 10.99.0.0/16 and 3. */
    public static function slice(string $cidr, int $index): ?string
    {
        $parsed = self::parse($cidr);
        if ($parsed === null || $index < 0 || $index >= self::slices($cidr)) {
            return null;
        }

        return self::toIp($parsed[0] + ($index << 8)) . '/24';
    }

    /** The position of a /24 slice in a range, null when it is not one of its slices. */
    public static function sliceIndex(string $cidr, string $slice): ?int
    {
        $range = self::parse($cidr);
        $part = self::parse($slice);
        if ($range === null || $part === null || $part[1] !== 24 || ($part[0] & self::mask($range[1])) !== $range[0]) {
            return null;
        }

        return ($part[0] - $range[0]) >> 8;
    }

    /** The address of the gateway of a /24 slice (its first host), which is the node itself. */
    public static function gateway(string $slice): ?string
    {
        $parsed = self::parse($slice);

        return $parsed === null ? null : self::toIp($parsed[0] + 1);
    }

    /** The addresses of a /24 slice that servers can have: from .2 to .254. */
    public static function hosts(string $slice): array
    {
        $parsed = self::parse($slice);
        if ($parsed === null) {
            return [];
        }
        $out = [];
        for ($i = 2; $i <= 254; ++$i) {
            $out[] = self::toIp($parsed[0] + $i);
        }

        return $out;
    }
}
