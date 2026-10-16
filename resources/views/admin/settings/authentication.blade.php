@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'authentication'])

@section('title')
    Authentication
@endsection

@section('content-header')
    <h1>Authentication<small>The captcha on the forms, and whether people can sign up on their own.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <form action="{{ route('admin.settings.authentication') }}" method="POST" autocomplete="off">
        <div class="row">
            <div class="col-md-6">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Captcha</h3>
                    </div>
                    <div class="box-body">
                        <p class="text-muted">Checked on the sign in, sign up and password reset forms.</p>
                        <div class="form-group">
                            <label class="control-label" for="captcha">Captcha</label>
                            <select id="captcha" name="captcha" class="form-control">
                                <option value="none" @if(old('captcha', $provider) === 'none') selected @endif>None</option>
                                <option value="recaptcha" @if(old('captcha', $provider) === 'recaptcha') selected @endif>Google reCAPTCHA (invisible)</option>
                                <option value="turnstile" @if(old('captcha', $provider) === 'turnstile') selected @endif>Cloudflare Turnstile</option>
                            </select>
                        </div>

                        <div data-captcha="recaptcha">
                            <div class="form-group">
                                <label class="control-label" for="recaptcha-site">reCAPTCHA site key</label>
                                <input id="recaptcha-site" type="text" name="recaptcha_site_key" class="form-control" spellcheck="false"
                                       value="{{ old('recaptcha_site_key', config('recaptcha.website_key')) }}">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="recaptcha-secret">reCAPTCHA secret key</label>
                                <input id="recaptcha-secret" type="password" name="recaptcha_secret_key" class="form-control" autocomplete="new-password" spellcheck="false"
                                       placeholder="A secret key is saved, enter a new one to replace it">
                                <p class="text-muted small">Make "reCAPTCHA v2 &rarr; Invisible" keys at <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer">google.com/recaptcha/admin</a>. Used between this panel and Google, keep it secret.</p>
                            </div>
                            @if($recaptchaShipped)
                                <div class="alert alert-warning no-margin">
                                    You are using the reCAPTCHA keys that were shipped with the panel. They work, but keys made for your own website are better.
                                </div>
                            @endif
                        </div>

                        <div data-captcha="turnstile">
                            <div class="form-group">
                                <label class="control-label" for="turnstile-site">Turnstile site key</label>
                                <input id="turnstile-site" type="text" name="turnstile_site_key" class="form-control" spellcheck="false"
                                       value="{{ old('turnstile_site_key', config('auth.captcha.turnstile.site_key')) }}">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="turnstile-secret">Turnstile secret key</label>
                                <input id="turnstile-secret" type="password" name="turnstile_secret_key" class="form-control" autocomplete="new-password" spellcheck="false"
                                       placeholder="{{ $hasTurnstileSecret ? 'A secret key is saved, enter a new one to replace it' : 'Paste the secret key' }}">
                                <p class="text-muted small">Make a widget (managed or invisible) at <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener noreferrer">Cloudflare &rarr; Turnstile</a> for the address of this panel. The secret key is stored encrypted.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Passkeys</h3>
                    </div>
                    <div class="box-body">
                        <p class="text-muted">
                            Lets people sign in with a fingerprint, a face, a PIN or a security key instead of a password. They add passkeys
                            under Account &rarr; Passkeys. A passkey is checked on the device, so it counts as two factors and does not ask for
                            the two-factor code. Passkeys only work on an https address (or localhost) and are tied to the domain of the panel.
                        </p>
                        <div class="checkbox checkbox-primary no-margin-bottom">
                            <input id="passkeys" type="checkbox" name="passkeys" value="1" @if(old('passkeys', config('auth.passkeys.enabled'))) checked @endif>
                            <label for="passkeys">Allow passkeys</label>
                        </div>
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Self sign up</h3>
                    </div>
                    <div class="box-body">
                        <p class="text-muted">
                            Off by default: accounts are made by admins. When it is on, anybody who can reach the panel can make an account,
                            with a username and password or with one of the <a href="{{ route('admin.settings.providers') }}">providers</a> that allow it.
                            Accounts made this way are normal accounts without any admin rights, and can create servers only if the panel lets
                            ordinary users do that.
                        </p>
                        <div class="checkbox checkbox-primary">
                            <input id="registration" type="checkbox" name="registration" value="1" @if(old('registration', config('auth.registration.enabled'))) checked @endif>
                            <label for="registration">Let people sign up on their own</label>
                        </div>
                        <div class="checkbox checkbox-primary">
                            <input id="registration-password" type="checkbox" name="registration_password" value="1" @if(old('registration_password', config('auth.registration.password'))) checked @endif>
                            <label for="registration-password">&hellip; with a username, email address and password</label>
                        </div>
                        <p class="text-muted small">
                            @if($providers === 0)
                                No providers are set up yet. Without a captcha, password sign up invites bots.
                            @else
                                Signing up with a provider is allowed per provider, on its own page.
                            @endif
                        </p>
                    </div>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-xs-12">
                <div class="box box-primary">
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </div>
        </div>
    </form>
@endsection

@section('footer-scripts')
    @parent
    <script>
        (function () {
            var select = document.getElementById('captcha');
            function show() {
                document.querySelectorAll('[data-captcha]').forEach(function (block) {
                    block.style.display = block.getAttribute('data-captcha') === select.value ? '' : 'none';
                });
            }
            select.addEventListener('change', show);
            show();
        })();
    </script>
@endsection
