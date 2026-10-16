import { authErrorMessage, providerUrl, queryParam } from '@/lib/authProviders';

describe('lib/authProviders', () => {
    it('has a sentence for every code the panel sends', () => {
        for (const code of ['denied', 'state', 'not_linked', 'email_taken', 'no_email', 'has_account']) {
            expect(authErrorMessage(code)).toBeTruthy();
        }
    });

    it('has a general sentence for a code it does not know and nothing for no code', () => {
        expect(authErrorMessage('<script>')).toContain('did not work');
        expect(authErrorMessage(null)).toBeUndefined();
        expect(authErrorMessage('')).toBeUndefined();
    });

    it('never puts the code itself on the screen', () => {
        expect(authErrorMessage('<b>x</b>')).not.toContain('<b>');
    });

    it('builds the address to sign in or to link', () => {
        expect(providerUrl('github')).toBe('/auth/oauth/github/redirect');
        expect(providerUrl('github', true)).toBe('/auth/oauth/github/redirect?link=1');
        expect(providerUrl('a/b')).toBe('/auth/oauth/a%2Fb/redirect');
    });

    it('reads a parameter', () => {
        expect(queryParam('?error=denied&x=1', 'error')).toBe('denied');
        expect(queryParam('', 'error')).toBeNull();
    });
});
