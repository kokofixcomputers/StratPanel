<?php

namespace Pterodactyl\Tests\Integration\Auth;

/**
 * A passkey in PHP, for the tests: it makes the same bytes a phone or a security key makes (ES256, no attestation), so the panel's
 * checks of challenge, origin, relying party, signature and counter are exercised for real.
 */
class VirtualAuthenticator
{
    private \OpenSSLAsymmetricKey $key;

    public string $credentialId;

    public int $counter = 0;

    public function __construct()
    {
        $this->key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $this->credentialId = random_bytes(32);
    }

    public static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function unb64(string $text): string
    {
        return base64_decode(strtr($text, '-_', '+/'));
    }

    /** The answer to navigator.credentials.create() for the options the panel gave. */
    public function create(array $options, string $origin = 'http://localhost', ?string $rpId = null, int $flags = 0x45): array
    {
        $rpId ??= $options['rp']['id'];
        $clientData = json_encode(['type' => 'webauthn.create', 'challenge' => $options['challenge'], 'origin' => $origin, 'crossOrigin' => false]);

        $details = openssl_pkey_get_details($this->key)['ec'];
        $cose = $this->map([
            [$this->int(1), $this->int(2)],
            [$this->int(3), $this->int(-7)],
            [$this->int(-1), $this->int(1)],
            [$this->int(-2), $this->bytes($details['x'])],
            [$this->int(-3), $this->bytes($details['y'])],
        ]);
        $authData = hash('sha256', $rpId, true) . chr($flags) . pack('N', $this->counter)
            . str_repeat("\0", 16) . pack('n', strlen($this->credentialId)) . $this->credentialId . $cose;
        $attestation = $this->map([
            [$this->text('fmt'), $this->text('none')],
            [$this->text('attStmt'), $this->map([])],
            [$this->text('authData'), $this->bytes($authData)],
        ]);

        return [
            'id' => self::b64($this->credentialId),
            'rawId' => self::b64($this->credentialId),
            'type' => 'public-key',
            'response' => [
                'clientDataJSON' => self::b64($clientData),
                'attestationObject' => self::b64($attestation),
                'transports' => ['internal'],
            ],
            'clientExtensionResults' => new \stdClass(),
        ];
    }

    /** The answer to navigator.credentials.get() for the options the panel gave. */
    public function get(array $options, string $userHandle, string $origin = 'http://localhost', ?string $rpId = null, ?int $counter = null, int $flags = 0x05): array
    {
        $rpId ??= $options['rpId'];
        $clientData = json_encode(['type' => 'webauthn.get', 'challenge' => $options['challenge'], 'origin' => $origin, 'crossOrigin' => false]);
        $authData = hash('sha256', $rpId, true) . chr($flags) . pack('N', $counter ?? ++$this->counter);
        openssl_sign($authData . hash('sha256', $clientData, true), $signature, $this->key, OPENSSL_ALGO_SHA256);

        return [
            'id' => self::b64($this->credentialId),
            'rawId' => self::b64($this->credentialId),
            'type' => 'public-key',
            'response' => [
                'clientDataJSON' => self::b64($clientData),
                'authenticatorData' => self::b64($authData),
                'signature' => self::b64($signature),
                'userHandle' => self::b64($userHandle),
            ],
            'clientExtensionResults' => new \stdClass(),
        ];
    }

    private function head(int $major, int $value): string
    {
        return match (true) {
            $value < 24 => chr(($major << 5) | $value),
            $value < 256 => chr(($major << 5) | 24) . chr($value),
            default => chr(($major << 5) | 25) . pack('n', $value),
        };
    }

    private function int(int $n): string
    {
        return $n >= 0 ? $this->head(0, $n) : $this->head(1, -1 - $n);
    }

    private function bytes(string $s): string
    {
        return $this->head(2, strlen($s)) . $s;
    }

    private function text(string $s): string
    {
        return $this->head(3, strlen($s)) . $s;
    }

    /** @param  array<int, array{0: string, 1: string}>  $pairs */
    private function map(array $pairs): string
    {
        return $this->head(5, count($pairs)) . implode('', array_map(fn ($pair) => $pair[0] . $pair[1], $pairs));
    }
}
