<?php

namespace Pterodactyl\Services\Auth\OAuth;

/** Who a service says the person is. */
final class OAuthProfile
{
    public function __construct(
        public readonly string $id,
        public readonly ?string $email,
        /** Whether the service says the address was checked, null when it does not say. */
        public readonly ?bool $emailVerified,
        public readonly ?string $username,
        public readonly ?string $name,
    ) {
    }
}
