<?php

namespace Pterodactyl\Services\Acme;

use skoerfgen\ACMECert\ACMECert;
use Illuminate\Contracts\Encryption\Encrypter;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * The account of this panel at Let's Encrypt. It is made the first time one is needed: a key (kept encrypted in the settings) and the
 * registration with the authority, in the name of nobody but the admin's address if one was given.
 */
class AcmeAccount
{
    private const KEY = 'settings::acme:account_key';

    private const REGISTERED = 'settings::acme:registered';

    public function __construct(private SettingsRepositoryInterface $settings, private Encrypter $encrypter)
    {
    }

    public function directory(): string
    {
        return config('acme.staging') ? (string) config('acme.staging_directory') : (string) config('acme.directory');
    }

    public function client(): ACMECert
    {
        $client = new ACMECert($this->directory());
        // Nothing goes to the logs of PHP but errors.
        $client->setLogger(fn () => null);
        $client->loadAccountKey($this->key($client));

        // The staging and the real authority are different: an account is registered once for each key and directory.
        $marker = hash('sha256', $this->directory() . '|' . (string) config('acme.email'));
        if ((string) $this->settings->get(self::REGISTERED, '') !== $marker) {
            $email = trim((string) config('acme.email'));
            $client->register(true, $email !== '' ? ['mailto:' . $email] : []);
            $this->settings->set(self::REGISTERED, $marker);
        }

        return $client;
    }

    private function key(ACMECert $client): string
    {
        $stored = (string) $this->settings->get(self::KEY, '');
        if ($stored !== '') {
            try {
                return $this->encrypter->decryptString($stored);
            } catch (\Throwable) {
                // The application key changed since, a new account is made.
            }
        }

        $key = $client->generateECKey('P-256');
        $this->settings->set(self::KEY, $this->encrypter->encryptString($key));
        $this->settings->set(self::REGISTERED, '');

        return $key;
    }
}
