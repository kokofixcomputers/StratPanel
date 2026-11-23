<?php

namespace Pterodactyl\Tests\Integration\Store;

use Mockery\MockInterface;
use Pterodactyl\Models\Box;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Illuminate\Http\Client\Request;
use Pterodactyl\Models\Allocation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\StoreOrder;
use Pterodactyl\Models\StorePackage;
use Pterodactyl\Services\Store\StoreService;
use Pterodactyl\Services\Store\StoreSettings;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** The store: packages bought with Stripe or PayPal make a box or a server, and renew them. Payment services are faked, nothing leaves the machine. */
class StoreTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private const WEBHOOK_SECRET = 'whsec_test';

    private MockInterface $daemon;

    private Egg $egg;

    private int $node;

    public function setUp(): void
    {
        parent::setUp();

        $this->egg = Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        config(['pterodactyl.self_service.egg' => $this->egg->id, 'pterodactyl.self_service.skip_scripts' => true]);
        $this->daemon = \Mockery::mock(DaemonServerRepository::class);
        $this->daemon->shouldReceive('setServer')->andReturnSelf();
        $this->daemon->shouldReceive('create')->andReturnNull();
        $this->daemon->shouldReceive('sync')->andReturnNull();
        $this->daemon->shouldReceive('delete')->andReturnNull();
        $this->swap(DaemonServerRepository::class, $this->daemon);

        $seed = $this->createServerModel(['egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        Allocation::factory()->times(10)->create(['node_id' => $seed->node_id]);
        $this->node = $seed->node_id;

        DB::table('settings')->where('key', 'like', 'settings::store:%')->delete();
        $settings = $this->app->make(StoreSettings::class);
        $settings->set('enabled', 'true');
        $settings->set('currency', 'USD');
        $settings->set('stripe_enabled', 'true');
        $settings->set('stripe_secret', 'sk_test_123');
        $settings->set('stripe_webhook_secret', self::WEBHOOK_SECRET);
        $settings->set('paypal_enabled', 'true');
        $settings->set('paypal_client_id', 'client');
        $settings->set('paypal_secret', 'secret');
        $settings->set('paypal_mode', 'sandbox');
        Http::preventStrayRequests();
    }

    private function package(string $kind = 'box', array $over = []): StorePackage
    {
        return StorePackage::query()->create($over + [
            'name' => 'Pkg ' . bin2hex(random_bytes(3)), 'kind' => $kind, 'active' => true, 'sort' => 0, 'price' => 1000, 'period_days' => 30,
            'memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'allocations' => 3, 'backups' => 2, 'databases' => 1, 'node_id' => $this->node,
        ]);
    }

    private function stripeCheckout(User $user, StorePackage $package, array $extra = []): StoreOrder
    {
        // A new session id every time (an earlier fake of the same address would otherwise answer first).
        Http::fake(['api.stripe.com/v1/checkout/sessions' => fn () => Http::response(['id' => 'cs_' . bin2hex(random_bytes(4)), 'url' => 'https://checkout.stripe.com/pay/x'], 200)]);
        $this->actingAs($user)->postJson('/api/client/store/checkout', ['package' => $package->uuid, 'provider' => 'stripe'] + $extra)->assertOk()->assertJsonPath('url', 'https://checkout.stripe.com/pay/x');

        return StoreOrder::query()->where('user_id', $user->id)->orderByDesc('id')->firstOrFail();
    }

    private function stripeEvent(string $type, StoreOrder $order, array $object = []): array
    {
        $body = json_encode(['type' => $type, 'data' => ['object' => $object + [
            'client_reference_id' => $order->uuid, 'payment_status' => 'paid', 'amount_total' => $order->amount, 'currency' => strtolower($order->currency), 'payment_intent' => 'pi_' . $order->id,
        ]]]);
        $time = time();

        return [$body, 't=' . $time . ',v1=' . hash_hmac('sha256', $time . '.' . $body, self::WEBHOOK_SECRET)];
    }

    private function deliver(string $provider, string $body, string $signature)
    {
        return $this->call('POST', '/api/store/webhooks/' . $provider, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => $signature], $body);
    }

    public function testNothingCanBeBoughtWhileTheStoreIsClosed(): void
    {
        $package = $this->package();
        $this->app->make(StoreSettings::class)->set('enabled', 'false');
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/client/store')->assertOk()->assertJsonPath('open', false)->assertJsonCount(0, 'packages');
        $this->actingAs($user)->postJson('/api/client/store/checkout', ['package' => $package->uuid, 'provider' => 'stripe'])->assertStatus(400);
    }

    public function testThePackagesAndWaysOfPayingAreListedWhenOpen(): void
    {
        $package = $this->package('box', ['name' => 'Listed ' . bin2hex(random_bytes(3))]);

        $this->actingAs(User::factory()->create())->getJson('/api/client/store')->assertOk()->assertJsonPath('open', true)->assertJsonPath('currency', 'USD')
            ->assertJsonCount(2, 'providers')->assertJsonFragment(['id' => $package->uuid, 'price' => 1000, 'kind' => 'box']);
    }

    public function testStripeCheckoutAsksStripeForTheExactAmountAndKeepsAPendingOrder(): void
    {
        $user = User::factory()->create();
        $package = $this->package();
        $order = $this->stripeCheckout($user, $package);

        $this->assertSame('pending', $order->status);
        $this->assertSame(1000, $order->amount);
        $this->assertNotNull($order->provider_reference);
        Http::assertSent(function (Request $request) use ($order) {
            return $request->url() === 'https://api.stripe.com/v1/checkout/sessions'
                && $request['client_reference_id'] === $order->uuid
                && $request['line_items'][0]['price_data']['unit_amount'] === 1000
                && $request['line_items'][0]['price_data']['currency'] === 'usd'
                && $request['mode'] === 'payment';
        });
        $this->assertSame(0, Box::query()->where('user_id', $user->id)->count());
    }

    public function testAGenuineStripeWebhookMakesTheBoxOnce(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order);

        $this->deliver('stripe', $body, $signature)->assertOk();
        $this->deliver('stripe', $body, $signature)->assertOk();

        $box = Box::query()->where('user_id', $user->id)->sole();
        $this->assertSame('order', $box->source);
        $this->assertSame([4096, 10240, 200, 3, 2, 1], [$box->memory, $box->disk, $box->cpu, $box->allocations, $box->backups, $box->databases]);
        $this->assertSame($this->node, $box->node_id);
        $this->assertEqualsWithDelta(now()->addDays(30)->timestamp, $box->expires_at->timestamp, 5);
        $order->refresh();
        $this->assertSame('paid', $order->status);
        $this->assertSame($box->id, $order->box_id);
        $this->assertNotNull($order->fulfilled_at);
    }

    public function testAForgedOrStaleWebhookDoesNothing(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        [$body] = $this->stripeEvent('checkout.session.completed', $order);

        $this->deliver('stripe', $body, 't=' . time() . ',v1=' . str_repeat('a', 64))->assertOk();
        $old = time() - 4000;
        $this->deliver('stripe', $body, 't=' . $old . ',v1=' . hash_hmac('sha256', $old . '.' . $body, self::WEBHOOK_SECRET))->assertOk();

        $this->assertSame('pending', $order->refresh()->status);
        $this->assertSame(0, Box::query()->where('user_id', $user->id)->count());
    }

    public function testAPaymentOfAnotherAmountIsNotAccepted(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order, ['amount_total' => 1]);

        $this->deliver('stripe', $body, $signature)->assertOk();

        $this->assertSame('failed', $order->refresh()->status);
        $this->assertSame(0, Box::query()->where('user_id', $user->id)->count());
    }

    public function testComingBackFromStripeAsksStripeAndMakesWhatWasBought(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        Http::fake(['api.stripe.com/v1/checkout/sessions/' . $order->provider_reference => Http::response(['payment_status' => 'paid', 'status' => 'complete', 'amount_total' => 1000, 'currency' => 'usd', 'payment_intent' => 'pi_x'], 200)]);

        // Somebody else cannot settle the order of this person.
        $this->actingAs(User::factory()->create())->postJson('/api/client/store/orders/' . $order->uuid . '/confirm')->assertStatus(404);
        $this->actingAs($user)->postJson('/api/client/store/orders/' . $order->uuid . '/confirm')->assertOk()->assertJsonPath('status', 'paid')->assertJsonPath('setting_up', false);

        $this->assertSame(1, Box::query()->where('user_id', $user->id)->count());
        $this->assertSame('pi_x', $order->refresh()->provider_payment);
    }

    public function testAnUnpaidSessionStaysPendingWhenThePersonComesBack(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        Http::fake(['api.stripe.com/v1/checkout/sessions/*' => Http::response(['payment_status' => 'unpaid', 'status' => 'open'], 200)]);

        $this->actingAs($user)->postJson('/api/client/store/orders/' . $order->uuid . '/confirm')->assertOk()->assertJsonPath('status', 'pending');
        $this->assertSame(0, Box::query()->where('user_id', $user->id)->count());
    }

    public function testPayPalIsApprovedThenCapturedWhenThePersonComesBack(): void
    {
        $user = User::factory()->create();
        $package = $this->package();
        $pp = 'PP-' . bin2hex(random_bytes(4));
        Http::fake([
            'api-m.sandbox.paypal.com/v1/oauth2/token' => Http::response(['access_token' => 'tok'], 200),
            'api-m.sandbox.paypal.com/v2/checkout/orders' => Http::response(['id' => $pp, 'links' => [['rel' => 'payer-action', 'href' => 'https://www.sandbox.paypal.com/checkoutnow?token=' . $pp]]], 201),
        ]);
        $this->actingAs($user)->postJson('/api/client/store/checkout', ['package' => $package->uuid, 'provider' => 'paypal'])->assertOk()->assertJsonPath('url', 'https://www.sandbox.paypal.com/checkoutnow?token=' . $pp);
        $order = StoreOrder::query()->where('user_id', $user->id)->sole();
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/v2/checkout/orders') && $r['purchase_units'][0]['amount']['value'] === '10.00' && $r['purchase_units'][0]['custom_id'] === $order->uuid);

        Http::fake([
            'api-m.sandbox.paypal.com/v1/oauth2/token' => Http::response(['access_token' => 'tok'], 200),
            'api-m.sandbox.paypal.com/v2/checkout/orders/' . $pp => Http::response(['status' => 'APPROVED'], 200),
            'api-m.sandbox.paypal.com/v2/checkout/orders/' . $pp . '/capture' => Http::response(['status' => 'COMPLETED', 'purchase_units' => [['payments' => ['captures' => [['id' => 'CAP-' . $pp, 'amount' => ['value' => '10.00', 'currency_code' => 'USD']]]]]]], 201),
        ]);
        $this->actingAs($user)->postJson('/api/client/store/orders/' . $order->uuid . '/confirm')->assertOk()->assertJsonPath('status', 'paid');

        $this->assertSame(1, Box::query()->where('user_id', $user->id)->count());
        $this->assertSame('CAP-' . $pp, $order->refresh()->provider_payment);
    }

    public function testAServerPackageMakesAServerForTheBuyer(): void
    {
        $user = User::factory()->create();
        $package = $this->package('server', ['name' => 'Starter ' . bin2hex(random_bytes(3)), 'memory' => 2048, 'disk' => 5120, 'cpu' => 100, 'allocations' => 2, 'backups' => 1, 'databases' => 0]);
        $order = $this->stripeCheckout($user, $package);
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order);

        $this->deliver('stripe', $body, $signature)->assertOk();

        $server = Server::query()->where('owner_id', $user->id)->sole();
        $this->assertNull($server->box_id);
        $this->assertSame([2048, 5120, 100, 2], [$server->memory, $server->disk, $server->cpu, $server->allocation_limit]);
        $this->assertSame($this->node, $server->node_id);
        $this->assertEqualsWithDelta(now()->addDays(30)->timestamp, $server->expires_at->timestamp, 5);
        $this->assertSame($server->id, $order->refresh()->server_id);
    }

    public function testRenewingLengthensTheTimeAndLetsAnExpiredBoxRunAgain(): void
    {
        $user = User::factory()->create();
        $package = $this->package();
        $box = $this->app->make(\Pterodactyl\Services\Boxes\BoxService::class)->create($user, ['name' => 'Mine', 'node_id' => $this->node, 'memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'source' => 'order', 'expires_at' => now()->addDays(5)]);

        $order = $this->stripeCheckout($user, $package, ['box' => $box->uuid]);
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order);
        $this->deliver('stripe', $body, $signature)->assertOk();
        // From the end of what was left, not from today.
        $this->assertEqualsWithDelta(now()->addDays(35)->timestamp, $box->refresh()->expires_at->timestamp, 5);

        $box->forceFill(['expires_at' => now()->subDay(), 'status' => 'expired'])->save();
        $second = $this->stripeCheckout($user, $package, ['box' => $box->uuid]);
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $second);
        $this->deliver('stripe', $body, $signature)->assertOk();
        $box->refresh();
        $this->assertSame('active', $box->status);
        $this->assertEqualsWithDelta(now()->addDays(30)->timestamp, $box->expires_at->timestamp, 5);
        $this->assertSame(1, Box::query()->where('user_id', $user->id)->count());
    }

    public function testNobodyRenewsTheBoxOfSomebodyElse(): void
    {
        $owner = User::factory()->create();
        $box = $this->app->make(\Pterodactyl\Services\Boxes\BoxService::class)->create($owner, ['name' => 'Theirs', 'node_id' => $this->node, 'memory' => 4096, 'disk' => 10240, 'cpu' => 200]);
        Http::fake();

        $this->actingAs(User::factory()->create())->postJson('/api/client/store/checkout', ['package' => $this->package()->uuid, 'provider' => 'stripe', 'box' => $box->uuid])->assertStatus(400);
    }

    public function testAPaidOrderThatCannotBeSetUpKeepsItsReasonAndCanBeTriedAgain(): void
    {
        $user = User::factory()->create();
        $package = $this->package('server', ['node_id' => $this->node]);
        $order = $this->stripeCheckout($user, $package);
        // No port is free on the node.
        Allocation::query()->where('node_id', $this->node)->whereNull('server_id')->update(['server_id' => Server::query()->first()->id]);
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order);

        $this->deliver('stripe', $body, $signature)->assertOk();
        $order->refresh();
        $this->assertSame('paid', $order->status);
        $this->assertNull($order->fulfilled_at);
        $this->assertNotEmpty($order->error);
        $this->actingAs($user)->getJson('/api/client/store/orders')->assertOk()->assertJsonPath('data.0.setting_up', true);

        Allocation::factory()->times(3)->create(['node_id' => $this->node]);
        $this->actingAs(User::factory()->create(['root_admin' => true]))->postJson('/api/client/admin/orders/' . $order->id . '/fulfill')->assertOk()->assertJsonPath('setting_up', false);
        $this->assertSame(1, Server::query()->where('owner_id', $user->id)->count());
    }

    public function testRefundingAsksTheServiceAndCanTakeTheBoxAway(): void
    {
        $user = User::factory()->create();
        $order = $this->stripeCheckout($user, $this->package());
        [$body, $signature] = $this->stripeEvent('checkout.session.completed', $order);
        $this->deliver('stripe', $body, $signature)->assertOk();
        Http::fake(['api.stripe.com/v1/refunds' => Http::response(['id' => 're_1'], 200)]);

        $this->actingAs(User::factory()->create(['root_admin' => true]))->postJson('/api/client/admin/orders/' . $order->id . '/refund', ['revoke' => true])->assertOk()->assertJsonPath('status', 'refunded');

        Http::assertSent(fn (Request $r) => $r->url() === 'https://api.stripe.com/v1/refunds' && $r['payment_intent'] === 'pi_' . $order->id);
        $this->assertSame('expired', Box::query()->where('user_id', $user->id)->sole()->status);
        // A person cannot refund.
        $this->actingAs($user)->postJson('/api/client/admin/orders/' . $order->id . '/refund')->assertStatus(403);
    }

    public function testTheSecretsOfThePaymentServicesAreNeverGivenBack(): void
    {
        $admin = User::factory()->create(['root_admin' => true]);

        $response = $this->actingAs($admin)->getJson('/api/client/admin/settings/payments')->assertOk()->assertJsonPath('stripe.secret_set', true)->assertJsonPath('paypal.client_id', 'client');
        $this->assertStringNotContainsString('sk_test_123', $response->getContent());
        $this->assertStringNotContainsString(self::WEBHOOK_SECRET, $response->getContent());

        $this->patchJson('/api/client/admin/settings/payments', ['enabled' => true, 'currency' => 'eur', 'stripe' => ['enabled' => true, 'secret' => 'sk_live_new'], 'paypal' => ['enabled' => false, 'mode' => 'live']])->assertOk()->assertJsonPath('currency', 'EUR');
        $this->assertSame('sk_live_new', $this->app->make(StoreSettings::class)->get('stripe_secret'));
        // The secret in the database is not readable text.
        $this->assertStringNotContainsString('sk_live_new', (string) DB::table('settings')->where('key', 'settings::store:stripe_secret')->value('value'));
    }

    public function testPackagesAreManagedByAdminsOnly(): void
    {
        $admin = User::factory()->create(['root_admin' => true]);
        $payload = ['name' => 'Big ' . bin2hex(random_bytes(3)), 'kind' => 'box', 'active' => true, 'sort' => 1, 'price' => 2500, 'period_days' => 30, 'memory' => 8192, 'disk' => 20480, 'cpu' => 400, 'allocations' => 5, 'backups' => 5, 'databases' => 2];

        $this->actingAs(User::factory()->create())->postJson('/api/client/admin/packages', $payload)->assertStatus(403);
        $id = $this->actingAs($admin)->postJson('/api/client/admin/packages', $payload)->assertStatus(201)->json('id');
        $this->patchJson('/api/client/admin/packages/' . $id, array_merge($payload, ['price' => 3000]))->assertOk()->assertJsonPath('price', 3000);
        $this->deleteJson('/api/client/admin/packages/' . $id)->assertStatus(204);
    }
}
