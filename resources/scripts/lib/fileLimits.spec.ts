import { canEdit, isTooLargeError, MAX_EDIT_BYTES } from '@/lib/fileLimits';

describe('canEdit', () => {
    it('opens files up to the limit and refuses bigger ones', () => {
        expect(canEdit(1024)).toBe(true);
        expect(canEdit(MAX_EDIT_BYTES)).toBe(true);
        expect(canEdit(MAX_EDIT_BYTES + 1)).toBe(false);
        expect(canEdit(8 * 1024 * 1024)).toBe(false);
    });

    it('tries a file whose size is not known, the panel decides', () => {
        expect(canEdit(undefined)).toBe(true);
    });

    it('takes another limit', () => {
        expect(canEdit(2000, 1000)).toBe(false);
    });
});

describe('isTooLargeError', () => {
    const response = (data: unknown) => ({ response: { data } });

    it('knows the answer of the panel for a file that is too big', () => {
        const body = { errors: [{ code: 'FileSizeTooLargeException', detail: 'The file is too large' }] };

        expect(isTooLargeError(response(body))).toBe(true);
        // The editor asks for text, so the body arrives as a string.
        expect(isTooLargeError(response(JSON.stringify(body)))).toBe(true);
    });

    it('does not take other errors for it', () => {
        expect(isTooLargeError(response({ errors: [{ code: 'NotFoundHttpException' }] }))).toBe(false);
        expect(isTooLargeError(response('not json'))).toBe(false);
        expect(isTooLargeError(new Error('boom'))).toBe(false);
        expect(isTooLargeError(undefined)).toBe(false);
    });
});
