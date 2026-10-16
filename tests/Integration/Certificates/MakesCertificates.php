<?php

namespace Pterodactyl\Tests\Integration\Certificates;

/**
 * Real certificates for the tests, made with OpenSSL: self signed ones, and ones signed by a certificate authority of the test.
 */
trait MakesCertificates
{
    /**
     * @param  list<string>  $names  the DNS names (none: the certificate has only a Common Name)
     * @param  array{ca?: array{cert: \OpenSSLCertificate, key: \OpenSSLAsymmetricKey}, days?: int, ec?: bool, cn?: string, isCa?: bool}  $options
     * @return array{cert: \OpenSSLCertificate, key: \OpenSSLAsymmetricKey, certPem: string, keyPem: string}
     */
    protected function makeCertificate(array $names, array $options = []): array
    {
        $cn = $options['cn'] ?? ($names[0] ?? 'no-san.example');
        $config = tempnam(sys_get_temp_dir(), 'ssl');
        $san = $names === [] ? '' : 'subjectAltName=' . implode(',', array_map(fn ($n) => "DNS:$n", $names));
        $constraints = !empty($options['isCa']) ? 'basicConstraints=CA:TRUE' : 'basicConstraints=CA:FALSE';
        file_put_contents($config, "[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\nreq_extensions=v3\n[dn]\nCN=$cn\nO=Test Org\n[v3]\n$constraints\n$san\n");

        $key = !empty($options['ec'])
            ? openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1'])
            : openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $csr = openssl_csr_new(['commonName' => $cn, 'organizationName' => 'Test Org'], $key, ['config' => $config, 'digest_alg' => 'sha256', 'req_extensions' => 'v3']);

        $ca = $options['ca'] ?? null;
        $cert = openssl_csr_sign($csr, $ca['cert'] ?? null, $ca['key'] ?? $key, $options['days'] ?? 30, ['config' => $config, 'digest_alg' => 'sha256', 'x509_extensions' => 'v3']);
        unlink($config);

        openssl_x509_export($cert, $certPem);
        openssl_pkey_export($key, $keyPem);

        return ['cert' => $cert, 'key' => $key, 'certPem' => $certPem, 'keyPem' => $keyPem];
    }

    /** A certificate authority, and a certificate it signed. */
    protected function makeChain(array $names, int $days = 30): array
    {
        $ca = $this->makeCertificate([], ['cn' => 'Test CA', 'isCa' => true, 'days' => 365]);
        $leaf = $this->makeCertificate($names, ['ca' => $ca, 'days' => $days]);

        return ['ca' => $ca, 'leaf' => $leaf];
    }
}
