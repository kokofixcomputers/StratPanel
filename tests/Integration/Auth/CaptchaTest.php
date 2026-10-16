<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;

class CaptchaTest extends AuthTestCase
{
    private function service(): CaptchaService
    {
        return $this->app->make(CaptchaService::class);
    }

    private function captcha(string $provider): void
    {
        config([
            'auth.captcha.provider' => $provider,
            'auth.captcha.turnstile.site_key' => 'ts-site',
            'auth.captcha.turnstile.secret_key' => 'ts-secret',
            'recaptcha.website_key' => 'rc-site',
            'recaptcha.secret_key' => 'rc-secret',
            'recaptcha.verify_domain' => true,
        ]);
    }

    private function login(array $extra = [])
    {
        $user = User::query()->where('username', 'someone')->first() ?? $this->makeUser(['username' => 'someone']);

        return $this->postJson('/auth/login', array_merge(['user' => $user->username, 'password' => 'correct-horse-battery'], $extra));
    }

    public function testNoneMeansNoCheck(): void
    {
        $this->captcha('none');
        Http::fake();

        $this->login()->assertOk();
        Http::assertNothingSent();
        $this->assertSame('', $this->service()->siteKey());
    }

    public function testAnOldPanelKeepsWhatItsRecaptchaSwitchSays(): void
    {
        config(['auth.captcha.provider' => '', 'recaptcha.enabled' => true]);
        $this->assertSame('recaptcha', $this->service()->provider());

        config(['recaptcha.enabled' => false]);
        $this->assertSame('none', $this->service()->provider());

        config(['auth.captcha.provider' => 'nonsense', 'recaptcha.enabled' => true]);
        $this->assertSame('recaptcha', $this->service()->provider());
    }

    public function testTheBrowserGetsTheKeyOfTheCaptchaInUse(): void
    {
        $this->captcha('turnstile');
        $this->assertSame('ts-site', $this->service()->siteKey());

        $this->captcha('recaptcha');
        $this->assertSame('rc-site', $this->service()->siteKey());
    }

    public function testTurnstileLetsASolvedChallengeThrough(): void
    {
        $this->captcha('turnstile');
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => true, 'hostname' => 'panel.test'])]);

        $this->login(['captcha' => 'good-token'])->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'challenges.cloudflare.com/turnstile/v0/siteverify')
            && $request['secret'] === 'ts-secret' && $request['response'] === 'good-token');
    }

    public function testTurnstileRefusesABadChallenge(): void
    {
        $this->captcha('turnstile');
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => false, 'error-codes' => ['invalid-input-response']])]);

        $this->login(['captcha' => 'bad-token'])->assertStatus(400);
    }

    public function testTheOldFieldNamesStillWork(): void
    {
        $this->captcha('turnstile');
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => true])]);
        $this->login(['cf-turnstile-response' => 'good'])->assertOk();

        $this->signOut();
        $this->captcha('recaptcha');
        Http::fake(['www.google.com/*' => Http::response(['success' => true, 'hostname' => parse_url(config('app.url'), PHP_URL_HOST) ?: 'localhost'])]);
        config(['recaptcha.verify_domain' => false]);
        $this->login(['g-recaptcha-response' => 'good'])->assertOk();
    }

    public function testNoAnswerIsRefusedWithoutAskingAnyone(): void
    {
        foreach (['turnstile', 'recaptcha'] as $provider) {
            $this->captcha($provider);
            Http::fake();

            $this->login()->assertStatus(400);
            $this->login(['captcha' => ''])->assertStatus(400);
            $this->login(['captcha' => str_repeat('x', 5000)])->assertStatus(400);
            $this->login(['captcha' => ['array']])->assertStatus(400);
            Http::assertNothingSent();
        }
    }

    public function testAServiceThatCannotBeReachedIsAFailureNotAPass(): void
    {
        $this->captcha('turnstile');
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('down'));
        $this->login(['captcha' => 'token'])->assertStatus(400);

        Http::fake(['*' => Http::response('oops', 500)]);
        $this->login(['captcha' => 'token'])->assertStatus(400);

        Http::fake(['*' => Http::response('not json', 200)]);
        $this->login(['captcha' => 'token'])->assertStatus(400);
    }

    public function testRecaptchaStillComparesTheSiteItWasSolvedOn(): void
    {
        $this->signOut();
        $this->captcha('recaptcha');
        Http::fake(['www.google.com/*' => Http::response(['success' => true, 'hostname' => 'evil.example'])]);
        $this->login(['captcha' => 'token'])->assertStatus(400);

        config(['recaptcha.verify_domain' => false]);
        $this->login(['captcha' => 'token'])->assertOk();
    }

    public function testTheOtherFormsAreChecked(): void
    {
        $this->captcha('turnstile');
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => false])]);

        $this->postJson('/auth/password', ['email' => 'a@auth-test.example', 'captcha' => 'x'])->assertStatus(400);

        config(['auth.registration.enabled' => true]);
        $this->postJson('/auth/register', ['username' => 'newbie', 'email' => 'n@auth-test.example', 'password' => 'long-enough-1', 'password_confirmation' => 'long-enough-1', 'captcha' => 'x'])
            ->assertStatus(400);
        $this->assertSame(0, User::query()->where('username', 'newbie')->count());
    }

    public function testASuccessfulCheckIsSentTheAddressOfTheVisitor(): void
    {
        $this->captcha('turnstile');
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => true])]);

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->login(['captcha' => 'token'])->assertOk();

        Http::assertSent(fn ($request) => ($request['remoteip'] ?? null) === '203.0.113.7');
    }
}
