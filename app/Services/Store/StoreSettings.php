<?php

namespace Pterodactyl\Services\Store;

use Illuminate\Contracts\Encryption\Encrypter;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * What an admin set for the store: whether it is open, the currency, and the keys of the payment services. The secrets are kept encrypted and
 * are never given back to a page, only whether they are set.
 */
class StoreSettings
{
    private const PREFIX = 'settings::store:';

    /** Currencies where the smallest unit is the whole one (there are no cents). */
    public const ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

    public const SECRETS = ['stripe_secret', 'stripe_webhook_secret', 'paypal_secret'];

    public function __construct(private SettingsRepositoryInterface $settings, private Encrypter $encrypter)
    {
    }

    public function get(string $key, string $default = ''): string
    {
        $value = (string) $this->settings->get(self::PREFIX . $key, $default);
        if ($value !== '' && in_array($key, self::SECRETS, true)) {
            try {
                return $this->encrypter->decryptString($value);
            } catch (\Throwable) {
                return '';
            }
        }

        return $value;
    }

    public function set(string $key, string $value): void
    {
        if ($value === '') {
            $this->settings->forget(self::PREFIX . $key);

            return;
        }
        $this->settings->set(self::PREFIX . $key, in_array($key, self::SECRETS, true) ? $this->encrypter->encryptString($value) : $value);
    }

    public function enabled(): bool
    {
        return $this->get('enabled', 'false') === 'true';
    }

    public function currency(): string
    {
        return strtoupper($this->get('currency', 'USD')) ?: 'USD';
    }

    /** The panel's own address, where people come back to after paying. */
    public function appUrl(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    /** How many decimals an amount of the currency has. */
    public static function decimals(string $currency): int
    {
        return in_array(strtoupper($currency), self::ZERO_DECIMAL, true) ? 0 : 2;
    }

    /** An amount in the smallest unit as a decimal string, "12.50". */
    public static function decimal(int $amount, string $currency): string
    {
        $decimals = self::decimals($currency);

        return number_format($amount / (10 ** $decimals), $decimals, '.', '');
    }
}
