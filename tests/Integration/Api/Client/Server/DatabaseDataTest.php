<?php

namespace Pterodactyl\Tests\Integration\Api\Client\Server;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Database;
use Pterodactyl\Models\DatabaseHost;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

/** The data editor, against a real (scratch) schema on the database server the tests run on. */
class DatabaseDataTest extends ClientApiIntegrationTestCase
{
    private const SCHEMA = 'apitest_data';

    private DatabaseHost $host;

    public function setUp(): void
    {
        parent::setUp();

        // The panel hands out databases by a hash of the id, whose salt is a setting of the machine.
        config(['hashids.salt' => 'test-salt', 'hashids.length' => 8]);
        $this->app->forgetInstance(\Pterodactyl\Contracts\Extensions\HashidsInterface::class);
        DB::statement('DROP DATABASE IF EXISTS ' . self::SCHEMA);
        DB::statement('CREATE DATABASE ' . self::SCHEMA);
        DB::statement('CREATE TABLE ' . self::SCHEMA . '.people (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(40) NOT NULL, note TEXT NULL, avatar BLOB NULL)');
        DB::statement('CREATE TABLE ' . self::SCHEMA . '.loose (a VARCHAR(10), b VARCHAR(10))');
        DB::insert('INSERT INTO ' . self::SCHEMA . '.people (name, note, avatar) VALUES (?, ?, ?), (?, NULL, NULL), (?, ?, NULL)', ['Ann', 'hello', 'xyz', 'Bob', 'Cy', str_repeat('long', 300)]);
        DB::insert('INSERT INTO ' . self::SCHEMA . '.loose (a, b) VALUES (?, ?)', ['1', '2']);

        $config = config('database.connections.' . config('database.default'));
        $this->host = DatabaseHost::factory()->create([
            'host' => $config['host'], 'port' => $config['port'], 'username' => $config['username'], 'password' => Crypt::encrypt((string) $config['password']),
        ]);
    }

    public function tearDown(): void
    {
        DB::statement('DROP DATABASE IF EXISTS ' . self::SCHEMA);
        Database::query()->where('database', self::SCHEMA)->delete();
        $this->host->delete();

        parent::tearDown();
    }

    /** @return array{User, Server, Database} */
    private function account(array $permissions = []): array
    {
        $user = User::factory()->create();
        $egg = Egg::query()->firstOrFail();
        $server = $this->createServerModel(['user_id' => empty($permissions) ? $user->id : User::factory()->create()->id, 'egg_id' => $egg->id]);
        if (!empty($permissions)) {
            Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => $permissions]);
        }
        $database = Database::query()->create(['server_id' => $server->id, 'database_host_id' => $this->host->id, 'database' => self::SCHEMA, 'username' => 'u_' . bin2hex(random_bytes(5)), 'password' => Crypt::encrypt('x'), 'remote' => '%', 'max_connections' => 0]);

        return [$user, $server, $database];
    }

    private function url(Server $server, Database $database, string $path = ''): string
    {
        return "/api/client/servers/{$server->uuid}/databases/" . app(\Pterodactyl\Contracts\Extensions\HashidsInterface::class)->encode($database->id) . $path;
    }

    public function testTheSizeOfEveryDatabaseIsGiven(): void
    {
        [$user, $server, $database] = $this->account();

        $sizes = $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/databases/sizes")->assertOk()->json('sizes');

        $key = app(\Pterodactyl\Contracts\Extensions\HashidsInterface::class)->encode($database->id);
        $this->assertSame(2, $sizes[$key]['tables']);
        $this->assertGreaterThan(0, $sizes[$key]['bytes']);
    }

    public function testTheTablesAreListedWithTheirSize(): void
    {
        [$user, $server, $database] = $this->account();

        $json = $this->actingAs($user)->getJson($this->url($server, $database, '/tables'))->assertOk()->json();

        $this->assertSame(['loose', 'people'], array_column($json['tables'], 'name'));
        $this->assertGreaterThan(0, $json['bytes']);
    }

    public function testTheRowsAreGivenInPagesWithWhatTheGridNeeds(): void
    {
        [$user, $server, $database] = $this->account();

        $json = $this->actingAs($user)->getJson($this->url($server, $database, '/tables/people?per_page=2&sort=name&direction=desc'))->assertOk()->json();

        $this->assertSame(['id'], $json['primary']);
        $this->assertTrue($json['editable']);
        $this->assertSame(3, $json['pagination']['total']);
        $this->assertSame(2, $json['pagination']['total_pages']);
        $this->assertSame(['Cy', 'Bob'], array_column($json['rows'], 'name'));
        $this->assertNull($json['rows'][1]['note']);

        $all = $this->actingAs($user)->getJson($this->url($server, $database, '/tables/people?sort=name'))->json('rows');
        $this->assertSame(['binary' => 3], $all[0]['avatar'], 'a binary column is only its size');
        $this->assertSame(1200, $all[2]['note']['length']);
        $this->assertSame(400, mb_strlen($all[2]['note']['cut']));
    }

    public function testARowIsAddedChangedAndRemoved(): void
    {
        [$user, $server, $database] = $this->account();
        $url = $this->url($server, $database, '/tables/people');

        $this->actingAs($user)->postJson($url, ['values' => ['name' => 'Dee', 'note' => null]])->assertStatus(201);
        $id = DB::selectOne('SELECT id FROM ' . self::SCHEMA . '.people WHERE name = ?', ['Dee'])->id;

        $this->patchJson($url, ['key' => ['id' => $id], 'values' => ['name' => "Dee's", 'note' => 'edited']])->assertOk();
        $row = DB::selectOne('SELECT name, note FROM ' . self::SCHEMA . '.people WHERE id = ?', [$id]);
        $this->assertSame("Dee's", $row->name);
        $this->assertSame('edited', $row->note);

        $this->deleteJson($url, ['key' => ['id' => $id]])->assertNoContent();
        $this->assertNull(DB::selectOne('SELECT id FROM ' . self::SCHEMA . '.people WHERE id = ?', [$id]));
        $this->assertSame(3, DB::selectOne('SELECT COUNT(*) AS c FROM ' . self::SCHEMA . '.people')->c);
    }

    public function testNothingThatIsTypedBecomesPartOfTheStatement(): void
    {
        [$user, $server, $database] = $this->account();
        $url = $this->url($server, $database, '/tables/people');

        // A value that looks like SQL is only a value.
        $this->actingAs($user)->postJson($url, ['values' => ['name' => "x'); DROP TABLE people; --"]])->assertStatus(201);
        $this->assertSame(4, DB::selectOne('SELECT COUNT(*) AS c FROM ' . self::SCHEMA . '.people')->c);

        // A table or column that is not there is refused, whatever it holds.
        $this->getJson($this->url($server, $database, '/tables/' . urlencode('people`; DROP TABLE people; --')))->assertStatus(400);
        $this->postJson($url, ['values' => ['name`) VALUES (1); --' => 'x']])->assertStatus(400);
        $this->getJson($this->url($server, $database, '/tables/information_schema.tables'))->assertStatus(400);
        $this->getJson($url . '?sort=' . urlencode('name; DROP TABLE people'))->assertOk();
        $this->assertSame(4, DB::selectOne('SELECT COUNT(*) AS c FROM ' . self::SCHEMA . '.people')->c);
    }

    public function testWhatCanNotBeWrittenIsRefused(): void
    {
        [$user, $server, $database] = $this->account();
        $url = $this->url($server, $database, '/tables/people');
        $this->actingAs($user);

        $this->postJson($url, ['values' => ['name' => null]])->assertStatus(400);
        $this->postJson($url, ['values' => ['avatar' => 'binary']])->assertStatus(400);
        $this->patchJson($url, ['key' => ['id' => 1, 'name' => 'Ann'], 'values' => ['name' => 'x']])->assertStatus(400);
        $this->patchJson($url, ['key' => [], 'values' => ['name' => 'x']])->assertStatus(422);
    }

    public function testATableWithoutAPrimaryKeyCanOnlyBeLookedAt(): void
    {
        [$user, $server, $database] = $this->account();
        $this->actingAs($user);

        $this->getJson($this->url($server, $database, '/tables/loose'))->assertOk()->assertJsonPath('editable', false)->assertJsonPath('rows.0.a', '1');
        $this->deleteJson($this->url($server, $database, '/tables/loose'), ['key' => ['a' => '1']])->assertStatus(400);
        $this->assertSame(1, DB::selectOne('SELECT COUNT(*) AS c FROM ' . self::SCHEMA . '.loose')->c);
    }

    public function testThePermissionsAreTheOnesOfTheDatabases(): void
    {
        [$reader, $server, $database] = $this->account(['database.read']);
        $this->actingAs($reader);
        $this->getJson("/api/client/servers/{$server->uuid}/databases/sizes")->assertOk();
        $this->getJson($this->url($server, $database, '/tables'))->assertStatus(403);

        [$viewer, $server, $database] = $this->account(['database.read', 'database.view_password']);
        $this->actingAs($viewer);
        $this->getJson($this->url($server, $database, '/tables'))->assertOk();
        $this->postJson($this->url($server, $database, '/tables/people'), ['values' => ['name' => 'no']])->assertStatus(403);

        [$editor, $server, $database] = $this->account(['database.read', 'database.view_password', 'database.update']);
        $this->actingAs($editor)->postJson($this->url($server, $database, '/tables/people'), ['values' => ['name' => 'yes']])->assertStatus(201);
    }

    public function testADatabaseOfAnotherServerIsNotFound(): void
    {
        [$user, $server] = $this->account();
        [, , $other] = $this->account();

        $this->actingAs($user)->getJson($this->url($server, $other, '/tables'))->assertStatus(404);
    }
}
