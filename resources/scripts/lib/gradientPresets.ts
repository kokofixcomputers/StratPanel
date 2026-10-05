export interface GradientPreset {
    name: string;
    stops: string[];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
    // Nature
    { name: 'Ocean', stops: ['#00d2ff', '#3a7bd5'] },
    { name: 'Forest', stops: ['#56ab2f', '#a8e063'] },
    { name: 'Aurora', stops: ['#00c9ff', '#92fe9d', '#00b4db'] },
    { name: 'Lagoon', stops: ['#43c6ac', '#185a9d'] },
    { name: 'Tropical', stops: ['#11998e', '#38ef7d'] },
    { name: 'Waterfall', stops: ['#43cea2', '#185a9d'] },
    { name: 'Meadow', stops: ['#134e5e', '#71b280'] },
    { name: 'Moss', stops: ['#134e5e', '#a8c0a0'] },
    // Sky & Space
    { name: 'Sunset', stops: ['#ff6b6b', '#feca57', '#ff9ff3'] },
    { name: 'Ice', stops: ['#74ebd5', '#acb6e5'] },
    { name: 'Dawn', stops: ['#fc4a1a', '#f7b733', '#ffecd2'] },
    { name: 'Midnight', stops: ['#2c3e50', '#3498db'] },
    { name: 'Galaxy', stops: ['#0f0c29', '#302b63', '#24243e'] },
    { name: 'Nebula', stops: ['#ee0979', '#ff6a00'] },
    { name: 'Cosmic', stops: ['#6366f1', '#a855f7', '#ec4899'] },
    { name: 'Moonlight', stops: ['#0f3460', '#533483', '#e94560'] },
    { name: 'Starfall', stops: ['#1a1a2e', '#16213e', '#0f3460', '#533483'] },
    { name: 'Horizon', stops: ['#f7971e', '#ffd200', '#ff6ec7'] },
    // Vibrant
    { name: 'Fire', stops: ['#f12711', '#f5af19'] },
    { name: 'Violet', stops: ['#7b2ff7', '#f107a3'] },
    { name: 'Phoenix', stops: ['#f83600', '#f9d423'] },
    { name: 'Neon', stops: ['#f953c6', '#b91d73'] },
    { name: 'Cyber', stops: ['#00f2fe', '#4facfe'] },
    { name: 'Blossom', stops: ['#fd79a8', '#e84393', '#6c5ce7'] },
    { name: 'Coral', stops: ['#ff6b6b', '#ee5a24'] },
    { name: 'Rainbow', stops: ['#ff0000', '#ff7700', '#ffff00', '#00cc00', '#0000ff', '#8b00ff'] },
    { name: 'Candy', stops: ['#f953c6', '#b91d73', '#00d2ff'] },
    { name: 'Electric', stops: ['#00b09b', '#96c93d'] },
    // Soft & Pastel
    { name: 'Cotton Candy', stops: ['#ff9a9e', '#fecfef', '#ffecd2'] },
    { name: 'Rose Gold', stops: ['#f7797d', '#fbd786', '#c6ffdd'] },
    { name: 'Spring', stops: ['#a8edea', '#fed6e3'] },
    { name: 'Peach', stops: ['#ffecd2', '#fcb69f'] },
    { name: 'Lavender', stops: ['#e0c3fc', '#8ec5fc'] },
    { name: 'Sakura', stops: ['#f8cdda', '#fbb7c5'] },
    { name: 'Butter', stops: ['#fffde7', '#ffd54f'] },
    { name: 'Mint', stops: ['#e0f7fa', '#80deea'] },
    { name: 'Blush', stops: ['#fce4ec', '#f48fb1'] },
    { name: 'Creamsicle', stops: ['#ffecd2', '#ffb347'] },
    { name: 'Apricot', stops: ['#ffd3b6', '#ffaaa5', '#ff8b94'] },
    { name: 'Powder Blue', stops: ['#e3f2fd', '#90caf9'] },
    { name: 'Macaroon', stops: ['#f8b4c8', '#c8f8b4', '#b4c8f8'] },
    { name: 'Lilac', stops: ['#f3e5f5', '#ce93d8'] },
    { name: 'Honeydew', stops: ['#f1f8e9', '#a5d6a7'] },
    { name: 'Cloud', stops: ['#e3f2fd', '#fce4ec'] },
    { name: 'Vanilla', stops: ['#fff8e1', '#ffe082'] },
    { name: 'Cake', stops: ['#fce4ec', '#fff9c4', '#e8f5e9'] },
    { name: 'Fondant', stops: ['#f8bbd0', '#e1bee7', '#bbdefb'] },
    { name: 'Sherbet', stops: ['#ff9a9e', '#fad0c4', '#ffeaa7'] },
];

export const QUICK_PRESET_NAMES = ['Ocean', 'Sunset', 'Forest', 'Ice', 'Cosmic', 'Fire'];
export const QUICK_PRESETS = GRADIENT_PRESETS.filter((p) => QUICK_PRESET_NAMES.includes(p.name));
