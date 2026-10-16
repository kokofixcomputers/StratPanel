import { readLines } from '@/lib/ndjson';

describe('lib/ndjson', () => {
    it('returns the complete lines and keeps the rest', () => {
        expect(readLines('{"a":1}\n{"b":2}\n{"c"')).toEqual({ lines: [{ a: 1 }, { b: 2 }], rest: '{"c"' });
    });

    it('waits for a line that is not finished', () => {
        expect(readLines('{"a":')).toEqual({ lines: [], rest: '{"a":' });
        expect(readLines('{"a":1}\n')).toEqual({ lines: [{ a: 1 }], rest: '' });
    });

    it('skips empty lines and lines that are not JSON', () => {
        expect(readLines('\n  \nnot json\n{"ok":true}\n')).toEqual({ lines: [{ ok: true }], rest: '' });
    });
});
