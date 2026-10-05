<?php

namespace Pterodactyl\Console\Commands\Database;

use PDO;
use PDOException;
use Illuminate\Console\Command;
use Pterodactyl\Models\DatabaseHost;
use Symfony\Component\Process\Process;
use Pterodactyl\Services\Databases\Hosts\HostCreationService;
use Pterodactyl\Services\Databases\Hosts\HostUpdateService;

class SetupDatabaseHostCommand extends Command
{
    protected $signature = 'p:database-host:setup
                            {--name=StratPanel Databases : The name of the database host in the panel}
                            {--host= : The address servers and the panel use to reach the database, found automatically when left out}
                            {--port=3306 : The database port}
                            {--user=pterodactyluser : The database user to create for the host}
                            {--password= : The password for that user, generated when left out}
                            {--from=% : Where that user may connect from}
                            {--admin-user=root : A database account that is allowed to create users}
                            {--admin-password= : The password of that account, asked for when it is needed}
                            {--print-only : Create the database user but do not add the host to the panel}';

    protected $description = 'Creates a database user for game server databases and adds it to the panel as a database host, run it with sudo.';

    public function handle(): int
    {
        $user = (string) $this->option('user');
        $from = (string) $this->option('from');
        if (!preg_match('/^[A-Za-z0-9_]{1,32}$/', $user) || !preg_match('/^[A-Za-z0-9_.:%\-]{1,60}$/', $from)) {
            $this->error('The user may only contain letters, numbers and underscores, and --from must be a host name, an address or %.');

            return self::FAILURE;
        }

        $host = (string) ($this->option('host') ?: $this->detectHost());
        $port = (int) $this->option('port');
        $password = (string) ($this->option('password') ?: bin2hex(random_bytes(16)));
        $name = (string) $this->option('name');

        $this->info('Connecting to the database server...');
        $pdo = $this->connectAsAdmin();
        if (is_null($pdo)) {
            return self::FAILURE;
        }

        try {
            $account = $pdo->quote($user) . '@' . $pdo->quote($from);
            // CREATE ... IF NOT EXISTS followed by ALTER makes this safe to run again, it resets the password.
            $pdo->exec("CREATE USER IF NOT EXISTS $account IDENTIFIED BY " . $pdo->quote($password));
            $pdo->exec("ALTER USER $account IDENTIFIED BY " . $pdo->quote($password));
            // The panel creates and drops a database and user for every server database, which needs these rights
            // on everything and the right to hand them on.
            $pdo->exec("GRANT ALL PRIVILEGES ON *.* TO $account WITH GRANT OPTION");
            $pdo->exec('FLUSH PRIVILEGES');
        } catch (PDOException $exception) {
            $this->error('Could not create the database user: ' . $exception->getMessage());

            return self::FAILURE;
        }
        $this->info("The database user $user@$from is ready.");

        $linked = false;
        if (!$this->option('print-only')) {
            $linked = $this->addHostToPanel($name, $host, $port, $user, $password);
        }

        $this->printSummary($name, $host, $port, $user, $password, $linked);

        return self::SUCCESS;
    }

    /**
     * Servers run in Docker containers, which reach the machine they run on through the gateway of the Pterodactyl
     * network. That is the address a database host has to use, 127.0.0.1 would only work for the panel itself.
     */
    private function detectHost(): string
    {
        $process = new Process(['docker', 'network', 'inspect', 'pterodactyl_nw', '-f', '{{(index .IPAM.Config 0).Gateway}}']);
        try {
            $process->run();
        } catch (\Throwable $exception) {
            return '127.0.0.1';
        }

        $gateway = trim($process->getOutput());

        return $process->isSuccessful() && filter_var($gateway, FILTER_VALIDATE_IP) ? $gateway : '127.0.0.1';
    }

    /**
     * Tries the account that was asked for without a password first, which works for root over the local socket,
     * and asks for the password when that does not.
     */
    private function connectAsAdmin(): ?PDO
    {
        $config = config('database.connections.mysql');
        $socket = (string) ($config['unix_socket'] ?: $this->findSocket());
        $dsn = $socket !== ''
            ? "mysql:unix_socket=$socket"
            : sprintf('mysql:host=%s;port=%s', $config['host'], $config['port']);

        $admin = (string) $this->option('admin-user');
        $password = (string) $this->option('admin-password');

        for ($try = 0; $try < 3; $try++) {
            try {
                return new PDO($dsn, $admin, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            } catch (PDOException $exception) {
                if ($try === 2 || !str_contains($exception->getMessage(), 'Access denied')) {
                    $this->error('Could not connect: ' . $exception->getMessage());

                    return null;
                }

                $password = (string) $this->secret("Password of the database account \"$admin\" (leave empty to cancel)");
                if ($password === '') {
                    $this->error('Cancelled.');

                    return null;
                }
            }
        }

        return null;
    }

    private function findSocket(): string
    {
        foreach (['/var/run/mysqld/mysqld.sock', '/run/mysqld/mysqld.sock', '/var/lib/mysql/mysql.sock', '/tmp/mysql.sock'] as $path) {
            if (file_exists($path)) {
                return $path;
            }
        }

        return '';
    }

    /**
     * Adds the host to the panel, or updates it when one with the same name already exists.
     */
    private function addHostToPanel(string $name, string $host, int $port, string $user, string $password): bool
    {
        $data = ['name' => $name, 'host' => $host, 'port' => $port, 'username' => $user, 'password' => $password, 'node_id' => null];

        try {
            $existing = DatabaseHost::query()->where('name', $name)->first();
            if ($existing) {
                app(HostUpdateService::class)->handle($existing->id, $data);
                $this->info("Updated the database host \"$name\" in the panel.");
            } else {
                app(HostCreationService::class)->handle($data);
                $this->info("Added the database host \"$name\" to the panel.");
            }

            return true;
        } catch (\Throwable $exception) {
            $this->warn('The panel could not use the host yet: ' . $exception->getMessage());
            $this->line('Most often the database only listens on 127.0.0.1. Set bind-address = 0.0.0.0 in the database server config');
            $this->line('(for example /etc/mysql/mariadb.conf.d/50-server.cnf), restart it, then run this command again.');

            return false;
        }
    }

    private function printSummary(string $name, string $host, int $port, string $user, string $password, bool $linked): void
    {
        $this->newLine();
        $this->line($linked
            ? 'The host is set up. These are the details, in case you need them in the admin area (Databases):'
            : 'Enter these in the admin area under Databases -> Create New:');
        $this->table(['Setting', 'Value'], [
            ['Name', $name],
            ['Host', $host],
            ['Port', (string) $port],
            ['Username', $user],
            ['Password', $password],
            ['Linked Node', 'none (works for every node)'],
        ]);
        $this->comment('Keep the password somewhere safe, it is not shown again. Running this command again sets a new one.');
    }
}
