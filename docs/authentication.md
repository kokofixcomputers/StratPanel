# Authentication

Everything is set under **Admin > Settings**: *Authentication* (captcha, passkeys, self sign up) and *Providers* (the services people can
sign in with).

## Captcha

Checked on the sign in, sign up and password reset forms. Pick **None**, **Google reCAPTCHA** (invisible) or **Cloudflare Turnstile** and
enter the keys. Secrets are stored encrypted. A captcha that cannot be checked (the service is down, no answer) counts as failed.
A panel from before this setting keeps what its old reCAPTCHA switch said until you save the page.

## Providers

GitHub, Google, Discord, Microsoft, GitLab, or any other OAuth 2 service (enter the authorization, token and user info addresses and the
names of the fields in its answer). For each one:

1. Make an application at the service and give it the **callback address** shown on the provider's page
   (`https://your-panel/auth/oauth/<key>/callback`, it has to match exactly).
2. Enter the client ID and secret (stored encrypted, never shown again) and switch the provider on.

On the sign in page every provider that is on gets a "Continue with ..." button. Signed in users link services under
**Account > Providers** (and unlink them there). An account is recognised by the id the service gives, **never by email address**: a
service that "matches" an existing email does not get into that account, the owner has to link it on purpose. Somebody with two-factor
enabled still gives the code after signing in with a service.

## Passkeys

Sign in with a fingerprint, face, PIN or security key. On by default, an admin can turn it off. Users add passkeys under
**Account > Passkeys**. A passkey is checked on the device (something you have plus something you are or know), so it does not ask for
the two-factor code on top. Passkeys need an `https` address (or `localhost`) and belong to the domain of the panel: if the panel moves to
another domain the passkeys stop working and have to be added again. Behind a reverse proxy the panel has to see the real host
(`TRUSTED_PROXIES`).

## Self sign up

**Off by default.** When on, anybody who can reach the panel can make an account, with a username, email address and password and/or with
a provider that has "can sign up" ticked. These are normal accounts (no admin rights, nothing mailed to the address they typed). Use a
captcha with it.

Somebody who signs up with a service has no password. They can choose one with the usual "forgot password" mail or under Account, and the
panel will not let them unlink their last way of signing in before they have one.

## Notes

- Signing in with a service is a redirect of the whole browser, so the session cookie must be sent when the service sends the person back:
  keep `SESSION_SAME_SITE=lax` (the default), not `strict`.
- Passkeys and providers are in the tables `user_passkeys`, `auth_providers` and `user_identities`; `users.password_set` says whether
  somebody ever chose a password.
