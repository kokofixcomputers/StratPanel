/**
 * Draws blocks the way the game shows them in an inventory: a small 3D block seen from above at an angle, with the top
 * lightest, the left side a little darker and the right side the darkest. One WebGL canvas is shared and every block is drawn
 * once into a picture that is remembered. Plants and torches are flat sprites, as in the game. What to draw and with which
 * textures is decided in blockModel.ts, from the models and textures of the tools build (tools/install-mctools.sh).
 */
import { BlockPlan, ModelEntry, parseHex, planBlock, Shape } from '@/lib/blockModel';

export interface BlockIcon {
    // A picture to show, a data URL.
    url: string;
    // A flat sprite, to show with sharp pixels. The 3D ones are drawn big and shown smaller.
    flat: boolean;
}

const BASE = '/tools/mc-assets';
const SIZE = 64;

// ---- textures --------------------------------------------------------------------------------------------------------------

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
    });

const canvasOf = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    return canvas;
};

/** A texture as a square picture. Animated ones (water, lava, magma) are strips of frames, the first is taken. */
const loadTexture = async (version: string, name: string, base: string): Promise<HTMLCanvasElement | null> => {
    const image = await loadImage(`${base}/${version}/blocks/${name}.png`);
    if (!image) return null;

    const side = Math.min(image.width, image.height);
    const canvas = canvasOf(side, side);
    canvas.getContext('2d')!.drawImage(image, 0, 0, side, side, 0, 0, side, side);

    return canvas;
};

/** The texture multiplied with a colour, as the game tints grass and leaves. What was see-through stays so. */
const tinted = (source: HTMLCanvasElement, colour: string | undefined): HTMLCanvasElement => {
    const rgb = parseHex(colour);
    if (!rgb) return source;

    const canvas = canvasOf(source.width, source.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0);
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(source, 0, 0);

    return canvas;
};

const over = (base: HTMLCanvasElement, top: HTMLCanvasElement): HTMLCanvasElement => {
    const canvas = canvasOf(base.width, base.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(base, 0, 0);
    context.drawImage(top, 0, 0, base.width, base.height);

    return canvas;
};

// ---- models of the blocks --------------------------------------------------------------------------------------------------

type Models = Record<string, ModelEntry>;
const models = new Map<string, Promise<Models>>();

const loadModels = (version: string, base: string): Promise<Models> => {
    if (!models.has(version)) {
        models.set(
            version,
            fetch(`${base}/${version}/blocks_models.json`)
                .then((response) => (response.ok ? (response.json() as Promise<Models>) : {}))
                .catch(() => ({}))
        );
    }

    return models.get(version)!;
};

// ---- geometry --------------------------------------------------------------------------------------------------------------

// A face is 4 corners of 8 numbers each: where it is, which way it faces (for the shading) and where in the texture.
type Face = { texture: 0 | 1 | 2; corners: number[][] };

/**
 * The faces of a box that can be seen from where the game looks at a block: its top, the face towards -x, which is the left
 * one in the picture, and the face towards +z, which is the right one. Positions go from -0.5 to 0.5 like a whole block, the
 * texture coordinates follow the position so a part of a block shows the matching part of the texture.
 */
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Face[] => {
    const [ux0, ux1, uz0, uz1] = [x0 + 0.5, x1 + 0.5, z0 + 0.5, z1 + 0.5];
    const [vy0, vy1] = [0.5 - y0, 0.5 - y1];

    return [
        {
            texture: 0,
            corners: [
                [x0, y1, z1, 0, 1, 0, ux0, uz1],
                [x1, y1, z1, 0, 1, 0, ux1, uz1],
                [x1, y1, z0, 0, 1, 0, ux1, uz0],
                [x0, y1, z0, 0, 1, 0, ux0, uz0],
            ],
        },
        {
            // Seen from outside, the texture runs along +z.
            texture: 1,
            corners: [
                [x0, y0, z0, -1, 0, 0, uz0, vy0],
                [x0, y0, z1, -1, 0, 0, uz1, vy0],
                [x0, y1, z1, -1, 0, 0, uz1, vy1],
                [x0, y1, z0, -1, 0, 0, uz0, vy1],
            ],
        },
        {
            texture: 2,
            corners: [
                [x0, y0, z1, 0, 0, 1, ux0, vy0],
                [x1, y0, z1, 0, 0, 1, ux1, vy0],
                [x1, y1, z1, 0, 0, 1, ux1, vy1],
                [x0, y1, z1, 0, 0, 1, ux0, vy1],
            ],
        },
    ];
};

const SHAPES: Record<Exclude<Shape, 'flat'>, () => Face[]> = {
    cube: () => box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5),
    slab: () => box(-0.5, -0.5, -0.5, 0.5, 0, 0.5),
    // The lower step, and the higher one behind it.
    stairs: () => [...box(-0.5, -0.5, -0.5, 0.5, 0, 0.5), ...box(-0.5, 0, -0.5, 0.5, 0.5, 0)],
};

// ---- WebGL -----------------------------------------------------------------------------------------------------------------

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUV;
uniform mat4 uM;
uniform mat4 uP;
varying vec3 vNorm;
varying vec2 vUV;
void main(void) {
  gl_Position = uP * uM * vec4(aPos, 1.0);
  vNorm = aNorm;
  vUV = aUV;
}
`;

// The shading of the game's inventory blocks: the top at full brightness, the left side 0.8, the right side 0.6.
const FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
varying vec3 vNorm;
varying vec2 vUV;
void main(void) {
  vec4 colour = texture2D(uTex, vUV);
  if (colour.a < 0.05) discard;
  float light = vNorm.y > 0.5 ? 1.0 : (vNorm.x < -0.5 ? 0.8 : 0.6);
  gl_FragColor = vec4(colour.rgb * light, colour.a);
}
`;

type Matrix = number[];

const multiply = (a: Matrix, b: Matrix): Matrix => {
    const out = new Array(16).fill(0);
    for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) out[i + j * 4] += a[i + k * 4] * b[k + j * 4];

    return out;
};

const rotateX = (degrees: number): Matrix => {
    const r = (degrees * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];

    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};

const rotateY = (degrees: number): Matrix => {
    const r = (degrees * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];

    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
};

const orthographic = (half: number, near: number, far: number): Matrix => [
    1 / half, 0, 0, 0,
    0, 1 / half, 0, 0,
    0, 0, -2 / (far - near), 0,
    0, 0, -(far + near) / (far - near), 1,
]; // prettier-ignore

interface Renderer {
    gl: WebGLRenderingContext;
    canvas: HTMLCanvasElement;
    program: WebGLProgram;
}

let renderer: Renderer | null | undefined;

const compile = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader');

    return shader;
};

/** The shared canvas, null when the browser has no WebGL. */
const getRenderer = (): Renderer | null => {
    if (renderer !== undefined) return renderer;
    try {
        const canvas = canvasOf(SIZE, SIZE);
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
        if (!gl) return (renderer = null);

        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        return (renderer = { gl, canvas, program });
    } catch (e) {
        return (renderer = null);
    }
};

const draw = (
    { gl, canvas, program }: Renderer,
    faces: Face[],
    textures: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement]
): string => {
    gl.viewport(0, 0, SIZE, SIZE);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    // The game looks at a block from above at an angle, with a corner towards the viewer. 0.84 makes the block fill the picture.
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uM'), false, multiply(rotateX(30), rotateY(45)));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uP'), false, orthographic(0.84, -4, 4));

    const attribute = (name: string, size: number, offset: number) => {
        const at = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at, size, gl.FLOAT, false, 32, offset);
    };

    ([0, 1, 2] as const).forEach((index) => {
        const mine = faces.filter((face) => face.texture === index);
        if (!mine.length) return;

        const vertices = new Float32Array(mine.flatMap((face) => face.corners.flat()));
        const indices = new Uint16Array(mine.flatMap((_, face) => [0, 1, 2, 0, 2, 3].map((n) => face * 4 + n)));
        const vertexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        const indexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures[index]);
        // Sharp pixels, the textures are 16 by 16.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);

        attribute('aPos', 3, 0);
        attribute('aNorm', 3, 12);
        attribute('aUV', 2, 24);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

        gl.deleteTexture(texture);
        gl.deleteBuffer(vertexBuffer);
        gl.deleteBuffer(indexBuffer);
    });

    // Read right away, the canvas is cleared again once the browser has shown a frame.
    return canvas.toDataURL('image/png');
};

// ---- things the game draws from a model of its own ------------------------------------------------------------------------
// A shield and a chest are not made of block textures, the game builds them from a sheet of the entity. The parts are cut out
// of that sheet here.

// The sheet of each kind of chest, in entity/chest.
const CHESTS: Record<string, string> = {
    chest: 'normal',
    trapped_chest: 'trapped',
    ender_chest: 'ender',
    christmas_chest: 'christmas',
};

/** A square picture with parts of a sheet put on it, without smoothing, at the places given. */
const assemble = (sheet: HTMLImageElement, parts: [number, number, number, number, number, number][], size = 16) => {
    const canvas = canvasOf(size, size);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    parts.forEach(([sx, sy, w, h, dx, dy]) => context.drawImage(sheet, sx, sy, w, h, dx, dy, w, h));

    return canvas;
};

/**
 * A chest: 14 pixels wide and 15 tall (the lid is 5, the base 10), with the latch on the front. The front is the left face of
 * the picture, the side the right one, the top is the lid.
 */
const buildChest = async (version: string, file: string, base: string): Promise<BlockIcon | null> => {
    const sheet = await loadImage(`${base}/${version}/entity/chest/${file}.png`);
    if (!sheet) return null;

    const top = assemble(sheet, [[28, 0, 14, 14, 1, 1]]);
    const front = assemble(sheet, [
        [42, 14, 14, 5, 1, 1],
        [42, 33, 14, 10, 1, 6],
        // The latch hangs from the lid over the seam.
        [4, 1, 2, 4, 7, 3],
    ]);
    const side = assemble(sheet, [
        [28, 14, 14, 5, 1, 1],
        [28, 33, 14, 10, 1, 6],
    ]);

    const target = getRenderer();
    if (!target) return { url: front.toDataURL('image/png'), flat: true };

    return { url: draw(target, box(-0.4375, -0.5, -0.4375, 0.4375, 0.4375, 0.4375), [top, front, side]), flat: false };
};

/** The front of a shield, the plain wooden one, as a picture that fits an item slot. */
const buildShield = async (version: string, base: string): Promise<BlockIcon | null> => {
    // 1.21.5 and newer keep it in a folder of its own, older ones beside the other sheets.
    const sheet =
        (await loadImage(`${base}/${version}/entity/shield/shield_base_nopattern.png`)) ||
        (await loadImage(`${base}/${version}/entity/shield_base_nopattern.png`));
    if (!sheet) return null;

    // 12 by 22 pixels in the sheet. It is a bit bigger than the other items, the way the game shows it.
    const canvas = canvasOf(32, 32);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    const height = 28;
    // A little wider than the plate really is, it is seen at an angle in the game and would be a thin sliver in a slot.
    const width = Math.round(0.64 * height);
    context.drawImage(sheet, 1, 1, 12, 22, Math.round((32 - width) / 2), 2, width, height);

    return { url: canvas.toDataURL('image/png'), flat: false };
};

// ---- the picture of a block ------------------------------------------------------------------------------------------------

const build = async (version: string, id: string, base: string): Promise<BlockIcon | null> => {
    const name = id.replace(/^[^:]*:/, '');
    if (name === 'shield') return buildShield(version, base);
    if (CHESTS[name]) return buildChest(version, CHESTS[name], base);

    const all = await loadModels(version, base);
    const plan: BlockPlan | null = planBlock(name, all[name] ?? all[`${name}_inventory`]);
    if (!plan) return null;

    const [top, left, right, overlay] = await Promise.all([
        loadTexture(version, plan.top, base),
        loadTexture(version, plan.left, base),
        loadTexture(version, plan.right, base),
        plan.overlay ? loadTexture(version, plan.overlay, base) : Promise.resolve(null),
    ]);
    const first = top || left || right;
    if (!first) return null;

    const colours = plan.tint;
    const topFace = tinted(top || first, colours.top);
    const side = (texture: HTMLCanvasElement | null) => {
        const base = tinted(texture || first, colours.sides);

        return overlay ? over(base, tinted(overlay, colours.overlay)) : base;
    };

    const target = getRenderer();
    // Plants and torches are drawn flat in the game too. Without WebGL a block shows its top instead of nothing.
    if (plan.shape === 'flat' || !target) return { url: topFace.toDataURL('image/png'), flat: true };

    return { url: draw(target, SHAPES[plan.shape](), [topFace, side(left), side(right)]), flat: false };
};

const icons = new Map<string, Promise<BlockIcon | null>>();

/** The picture of a block item, null when the textures have nothing for it. Asked again for the same block it is the same. */
export const blockIcon = (version: string, id: string, base = BASE): Promise<BlockIcon | null> => {
    const key = `${version}:${id}`;
    if (!icons.has(key))
        icons.set(
            key,
            build(version, id, base).catch(() => null)
        );

    return icons.get(key)!;
};
