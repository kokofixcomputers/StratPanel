import {
    clearVitals,
    foodIcons,
    handleVitalsMessage,
    heartIcons,
    parseVitals,
    readVitals,
    saturatedIcons,
} from '@/lib/vitals';

const entry = {
    name: 'Steve',
    uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03',
    health: 18,
    maxHealth: 20,
    absorption: 0,
    food: 17,
    saturation: 5.2,
    level: 12,
    exp: 0.33,
    gameMode: 'creative',
};

describe('heartIcons', () => {
    it('draws full hearts, a half one for an odd number and empty containers', () => {
        expect(heartIcons(20, 20)).toEqual(Array(10).fill('full'));
        expect(heartIcons(7, 20)).toEqual([...Array(3).fill('full'), 'half', ...Array(6).fill('empty')]);
        expect(heartIcons(0, 20)).toEqual(Array(10).fill('empty'));
    });

    it('rounds the health up like the game does', () => {
        expect(heartIcons(18.2, 20)[9]).toBe('half');
        expect(heartIcons(0.1, 20)[0]).toBe('half');
    });

    it('has a heart for every 2 hit points of the maximum', () => {
        expect(heartIcons(10, 6)).toHaveLength(3);
        expect(heartIcons(30, 40)).toHaveLength(20);
        expect(heartIcons(30, 40).filter((i) => i === 'full')).toHaveLength(15);
    });
});

describe('foodIcons', () => {
    it('starts at the right and keeps the half drumstick at the left end of the full ones', () => {
        expect(foodIcons(20)).toEqual(Array(10).fill('full'));
        expect(foodIcons(7)).toEqual([...Array(3).fill('full'), 'half', ...Array(6).fill('empty')]);
        expect(foodIcons(0)).toEqual(Array(10).fill('empty'));
    });
});

describe('saturatedIcons', () => {
    it('covers one drumstick for every 2 points of saturation', () => {
        expect(saturatedIcons(0)).toBe(0);
        expect(saturatedIcons(0.4)).toBe(1);
        expect(saturatedIcons(5.2)).toBe(3);
        expect(saturatedIcons(20)).toBe(10);
    });
});

describe('parseVitals', () => {
    it('reads what the plugin sends', () => {
        expect(parseVitals(entry)).toEqual({
            health: 18,
            maxHealth: 20,
            absorption: 0,
            food: 17,
            saturation: 5.2,
            level: 12,
            exp: 0.33,
            gameMode: 'creative',
        });
    });

    it('has no game mode from a plugin that does not send one, or one that is not a mode', () => {
        expect(parseVitals({ ...entry, gameMode: undefined })?.gameMode).toBeNull();
        expect(parseVitals({ ...entry, gameMode: 'hardcore' })?.gameMode).toBeNull();
        expect(parseVitals({ ...entry, gameMode: 'spectator' })?.gameMode).toBe('spectator');
    });

    it('refuses numbers out of range and keeps saturation under food', () => {
        expect(parseVitals({ ...entry, health: -1 })).toBeNull();
        expect(parseVitals({ ...entry, food: 25 })).toBeNull();
        expect(parseVitals({ ...entry, exp: 'x' })).toBeNull();
        expect(parseVitals({ ...entry, food: 4, saturation: 9 })?.saturation).toBe(4);
        expect(parseVitals(null)).toBeNull();
    });
});

describe('the store', () => {
    it('replaces the players each time and skips bad entries', () => {
        handleVitalsMessage('s', {
            event: 'vitals',
            players: [entry, { name: 'bad name!', health: 1 }, { ...entry, name: 'Alex' }],
        });
        expect(Object.keys(readVitals('s')).sort()).toEqual(['Alex', 'Steve']);

        handleVitalsMessage('s', { event: 'vitals', players: [{ ...entry, name: 'Alex', health: 3 }] });
        expect(Object.keys(readVitals('s'))).toEqual(['Alex']);
        expect(readVitals('s').Alex.health).toBe(3);

        clearVitals('s');
        expect(readVitals('s')).toEqual({});
    });
});
