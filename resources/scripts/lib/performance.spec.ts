import {
    clearPerformance,
    HISTORY,
    handlePerformanceMessage,
    msptAlarm,
    parsePerformance,
    pushHistory,
    readPerformance,
    tpsAlarm,
} from '@/lib/performance';

describe('parsePerformance', () => {
    it('reads what the plugin sends', () => {
        expect(
            parsePerformance({
                event: 'performance',
                tps: [19.98, 20, 20],
                mspt: { avg: 12.4, min: 3.1, max: 41 },
                supported: true,
            })
        ).toEqual({ supported: true, tps: [19.98, 20, 20], mspt: { avg: 12.4, min: 3.1, max: 41 } });
    });

    it('takes mspt with only an average', () => {
        expect(parsePerformance({ event: 'performance', mspt: { avg: 8 } })).toEqual({
            supported: true,
            tps: null,
            mspt: { avg: 8 },
        });
    });

    it('refuses anything that is not a number in range', () => {
        const parsed = parsePerformance({
            event: 'performance',
            tps: [19, 'x', 20],
            mspt: { avg: -1, max: 'a' },
        });

        expect(parsed).toEqual({ supported: false, tps: null, mspt: null });
        expect(parsePerformance({ event: 'performance', tps: [999, 20, 20] })?.tps).toBeNull();
    });

    it('says unsupported when the server cannot tell', () => {
        expect(parsePerformance({ event: 'performance', supported: false })).toEqual({
            supported: false,
            tps: null,
            mspt: null,
        });
    });

    it('ignores other events', () => {
        expect(parsePerformance({ event: 'players' })).toBeNull();
    });
});

describe('history and alarms', () => {
    it('keeps the last values only', () => {
        let list: number[] = [];
        for (let i = 0; i < HISTORY + 5; i++) list = pushHistory(list, i);

        expect(list).toHaveLength(HISTORY);
        expect(list[list.length - 1]).toBe(HISTORY + 4);
        expect(list[0]).toBe(5);
    });

    it('warns when the server falls behind', () => {
        expect(tpsAlarm(20)).toBeUndefined();
        expect(tpsAlarm(17)).toBe('warning');
        expect(tpsAlarm(12)).toBe('danger');
        expect(msptAlarm(30)).toBeUndefined();
        expect(msptAlarm(45)).toBe('warning');
        expect(msptAlarm(80)).toBe('danger');
    });
});

describe('the store', () => {
    it('adds to the history per server and forgets when the server stops', () => {
        handlePerformanceMessage('a', { event: 'performance', tps: [20, 20, 20], mspt: { avg: 10 } });
        handlePerformanceMessage('a', { event: 'performance', tps: [19, 20, 20], mspt: { avg: 20 } });
        handlePerformanceMessage('b', { event: 'performance', tps: [18, 18, 18] });

        expect(readPerformance('a')?.tpsHistory).toEqual([20, 19]);
        expect(readPerformance('a')?.msptHistory).toEqual([10, 20]);
        expect(readPerformance('b')?.msptHistory).toEqual([]);

        clearPerformance('a');
        expect(readPerformance('a')).toBeNull();
        expect(readPerformance('b')).not.toBeNull();
        clearPerformance('b');
    });
});
