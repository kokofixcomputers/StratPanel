<?php

namespace Pterodactyl\Services\Auth;

use Ramsey\Uuid\Uuid;
use Illuminate\Support\Str;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Rules\Username;
use Illuminate\Contracts\Hashing\Hasher;
use Pterodactyl\Contracts\Repository\UserRepositoryInterface;

/**
 * Makes the account of somebody who signed up on their own. Unlike an account made by an admin nothing is mailed, a form that
 * anybody can fill in must not make the panel send mail to whatever address it is given.
 */
class SelfRegistrationService
{
    public function __construct(private UserRepositoryInterface $repository, private Hasher $hasher)
    {
    }

    /**
     * @param  string|null  $password  null when they signed up with a service: the account gets a password nobody knows
     *
     * @throws \Pterodactyl\Exceptions\Model\DataValidationException
     */
    public function create(string $username, string $email, ?string $password, ?string $name = null, string $via = 'password'): User
    {
        [$first, $last] = $this->splitName($name, $username);

        $user = $this->repository->create([
            'uuid' => Uuid::uuid4()->toString(),
            'username' => $username,
            'email' => $email,
            'name_first' => $first,
            'name_last' => $last,
            'password' => $this->hasher->make($password ?? Str::random(40)),
            'password_set' => $password !== null,
            'root_admin' => false,
        ], true, true);

        Activity::event('user:user.self-register')
            ->subject($user)
            ->property(['email' => $user->email, 'username' => $user->username, 'via' => $via])
            ->log();

        return $user;
    }

    /** A username that follows the rules and is not taken, from whatever a service gave. */
    public function usernameFor(?string $preferred, ?string $email): string
    {
        $base = mb_strtolower((string) ($preferred ?: Str::before((string) $email, '@')));
        $base = trim((string) preg_replace('/[^a-z0-9_.-]+/', '-', $base), '._-');
        $base = Str::limit($base, 30, '');
        if (mb_strlen($base) < 3) {
            $base = str_pad($base, 4, 'user');
        }
        // The rule wants letters or digits at both ends.
        $base = trim($base, '._-') ?: 'user';
        if (mb_strlen($base) < 3 || !preg_match(Username::VALIDATION_REGEX, $base)) {
            $base = 'user' . random_int(100, 999);
        }

        $candidate = $base;
        while (User::query()->where('username', $candidate)->exists()) {
            $candidate = $base . random_int(10, 9999);
        }

        return $candidate;
    }

    /** @return array{0: string, 1: string} */
    private function splitName(?string $name, string $fallback): array
    {
        $name = trim((string) preg_replace('/\s+/', ' ', (string) $name));
        if ($name === '') {
            return [Str::limit($fallback, 180, ''), '-'];
        }
        $parts = explode(' ', $name, 2);

        return [Str::limit($parts[0], 180, ''), Str::limit($parts[1] ?? '-', 180, '')];
    }
}
