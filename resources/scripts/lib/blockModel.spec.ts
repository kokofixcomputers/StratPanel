import { GRASS, parseHex, planBlock } from '@/lib/blockModel';

describe('planBlock', () => {
    it('draws a block with one texture as a cube', () => {
        expect(
            planBlock('stone', { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } })
        ).toEqual({
            shape: 'cube',
            top: 'stone',
            left: 'stone',
            right: 'stone',
            tint: {},
        });
    });

    it('puts the end on top and the side on both sides of a log', () => {
        const plan = planBlock('oak_log', {
            parent: 'minecraft:block/cube_column',
            textures: { end: 'minecraft:block/oak_log_top', side: 'minecraft:block/oak_log' },
        })!;

        expect(plan).toMatchObject({ shape: 'cube', top: 'oak_log_top', left: 'oak_log', right: 'oak_log' });
    });

    it('shows the front of a furnace on the left', () => {
        const plan = planBlock('furnace', {
            parent: 'minecraft:block/orientable',
            textures: {
                front: 'minecraft:block/furnace_front',
                side: 'minecraft:block/furnace_side',
                top: 'minecraft:block/furnace_top',
            },
        })!;

        expect(plan).toMatchObject({ top: 'furnace_top', left: 'furnace_front', right: 'furnace_side' });
    });

    it('tints grass and gives the sides of a grass block their edge', () => {
        const plan = planBlock('grass_block', {
            parent: 'block/block',
            textures: {
                top: 'block/grass_block_top',
                side: 'block/grass_block_side',
                overlay: 'block/grass_block_side_overlay',
                bottom: 'block/dirt',
            },
            elements: [{}],
        })!;

        expect(plan).toMatchObject({
            shape: 'cube',
            top: 'grass_block_top',
            left: 'grass_block_side',
            overlay: 'grass_block_side_overlay',
        });
        expect(plan.tint).toEqual({ top: GRASS, overlay: GRASS });
    });

    it('tints leaves on every side, but not the ones that have no tint', () => {
        const leaves = (name: string) =>
            planBlock(name, { parent: 'minecraft:block/leaves', textures: { all: `minecraft:block/${name}` } })!.tint;

        expect(leaves('oak_leaves').sides).toBe('#77ab2f');
        expect(leaves('birch_leaves').sides).toBe('#80a755');
        expect(leaves('spruce_leaves').sides).toBe('#619961');
        expect(leaves('cherry_leaves')).toEqual({});
    });

    it('draws slabs and stairs with the shape of the game', () => {
        const wood = {
            bottom: 'minecraft:block/oak_planks',
            side: 'minecraft:block/oak_planks',
            top: 'minecraft:block/oak_planks',
        };

        expect(planBlock('oak_slab', { parent: 'minecraft:block/slab', textures: wood })).toMatchObject({
            shape: 'slab',
            top: 'oak_planks',
        });
        expect(planBlock('oak_stairs', { parent: 'minecraft:block/stairs', textures: wood })).toMatchObject({
            shape: 'stairs',
        });
    });

    it('draws plants and torches as a flat sprite', () => {
        expect(
            planBlock('torch', {
                parent: 'minecraft:block/template_torch',
                textures: { torch: 'minecraft:block/torch' },
            })
        ).toMatchObject({
            shape: 'flat',
            top: 'torch',
        });
        expect(
            planBlock('oak_sapling', {
                parent: 'minecraft:block/cross',
                textures: { cross: 'minecraft:block/oak_sapling' },
            })
        ).toMatchObject({
            shape: 'flat',
            top: 'oak_sapling',
        });
        expect(
            planBlock('short_grass', {
                parent: 'minecraft:block/tinted_cross',
                textures: { cross: 'minecraft:block/short_grass' },
            })!.tint
        ).toEqual({ top: GRASS });
        expect(planBlock('rail', undefined)).toMatchObject({ shape: 'flat', top: 'rail' });
    });

    it('does not take a grass block for grass', () => {
        expect(
            planBlock('grass_block', {
                parent: 'block/block',
                textures: { top: 'block/grass_block_top', side: 'block/grass_block_side' },
            })!.shape
        ).toBe('cube');
    });

    it('uses the particle of a block that has nothing else, and the name of one the models do not know', () => {
        expect(planBlock('chest', { textures: { particle: 'minecraft:block/oak_planks' } })).toMatchObject({
            shape: 'cube',
            top: 'oak_planks',
        });
        expect(planBlock('mystery_block', undefined)).toMatchObject({
            shape: 'cube',
            top: 'mystery_block',
            left: 'mystery_block',
        });
    });
});

describe('parseHex', () => {
    it('reads a colour', () => {
        expect(parseHex('#79c05a')).toEqual([121, 192, 90]);
        expect(parseHex('79c05a')).toBeNull();
        expect(parseHex(undefined)).toBeNull();
    });
});
