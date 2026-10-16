/** Words for the short codes the panel puts in the address when signing in with another service did not work. */
const MESSAGES: Record<string, string> = {
    denied: 'You cancelled the sign in at the other service.',
    provider: 'The other service refused the sign in. Try again.',
    unknown: 'That way of signing in is not available.',
    state: 'The sign in took too long or was started somewhere else. Try again.',
    token: 'The other service could not be reached. Try again in a moment.',
    profile: 'The other service did not tell us who you are. Try again, or use another way to sign in.',
    not_linked:
        'No account is linked to that one. Sign in the usual way and link it under Account > Providers, or sign up if that is possible.',
    email_taken:
        'An account with that email address exists already. Sign in the usual way and link the service under Account > Providers.',
    no_email: 'The other service did not share a checked email address, which is needed to make an account.',
    signup_failed: 'The account could not be made. Try another way to sign up.',
    already_yours: 'That account is linked already.',
    linked_elsewhere: 'That account is linked to another account here already.',
    has_account: 'Another account of that service is linked to your account already. Unlink it first.',
};

export const authErrorMessage = (code: string | null | undefined): string | undefined =>
    code ? MESSAGES[code] ?? 'Signing in with the other service did not work. Try again.' : undefined;

/** The address that sends the browser to a service, to sign in or (when linking) to add it to the account. */
export const providerUrl = (key: string, link = false): string =>
    `/auth/oauth/${encodeURIComponent(key)}/redirect${link ? '?link=1' : ''}`;

/** The value of one parameter of an address like "?error=denied", without the rest. */
export const queryParam = (search: string, name: string): string | null => new URLSearchParams(search).get(name);
