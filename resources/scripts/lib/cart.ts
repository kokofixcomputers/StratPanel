/**
 * The cart of the store: which packages and how many, kept in this browser (per account). It holds no prices: they come from the store
 * every time, and the panel works the total out again when the person pays.
 */
import { useEffect, useState } from 'react';

export interface CartLine {
    package: string;
    quantity: number;
}

/** The most of one package in the cart, and the most things in all (the panel refuses more in one payment). */
export const MAX_PER_PACKAGE = 10;
export const MAX_IN_CART = 20;

const listeners = new Set<() => void>();
let current: { key: string; lines: CartLine[] } = { key: '', lines: [] };

const read = (key: string): CartLine[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');

        return Array.isArray(parsed)
            ? parsed
                  .filter((l) => l && typeof l.package === 'string' && Number.isInteger(l.quantity) && l.quantity > 0)
                  .map((l) => ({ package: l.package, quantity: Math.min(MAX_PER_PACKAGE, l.quantity) }))
            : [];
    } catch (e) {
        return [];
    }
};

const write = (key: string, lines: CartLine[]) => {
    current = { key, lines };
    try {
        localStorage.setItem(key, JSON.stringify(lines));
    } catch (e) {
        // A browser that does not keep it still has the cart for this visit.
    }
    listeners.forEach((listener) => listener());
};

const keyFor = (user: string) => `stratosphere:cart:${user}`;

const load = (user: string): CartLine[] => {
    const key = keyFor(user);
    if (current.key !== key) current = { key, lines: read(key) };

    return current.lines;
};

export const cartCount = (lines: CartLine[]): number => lines.reduce((sum, line) => sum + line.quantity, 0);

/** Puts one more of a package in the cart (no more than the limits). Returns whether it was added. */
export const addToCart = (user: string, pkg: string): boolean => {
    const lines = load(user);
    const found = lines.find((l) => l.package === pkg);
    if (cartCount(lines) >= MAX_IN_CART || (found && found.quantity >= MAX_PER_PACKAGE)) return false;
    write(
        keyFor(user),
        found
            ? lines.map((l) => (l === found ? { ...l, quantity: l.quantity + 1 } : l))
            : [...lines, { package: pkg, quantity: 1 }]
    );

    return true;
};

/** Sets how many of a package are in the cart, 0 takes it out. */
export const setQuantity = (user: string, pkg: string, quantity: number) => {
    const lines = load(user);
    const others = lines.filter((l) => l.package !== pkg);
    const next = Math.max(0, Math.min(quantity, MAX_PER_PACKAGE, MAX_IN_CART - cartCount(others)));
    const had = lines.some((l) => l.package === pkg);

    write(
        keyFor(user),
        next <= 0
            ? others
            : had
            ? lines.map((l) => (l.package === pkg ? { ...l, quantity: next } : l))
            : [...lines, { package: pkg, quantity: next }]
    );
};

export const clearCart = (user: string) => write(keyFor(user), []);

/** The cart of this person, kept up to date when it changes (also in another tab). */
export const useCart = (user: string): CartLine[] => {
    const [lines, setLines] = useState(() => load(user));

    useEffect(() => {
        const update = () => setLines(load(user));
        const onStorage = (e: StorageEvent) => {
            if (e.key === keyFor(user)) {
                current = { key: '', lines: [] };
                update();
            }
        };
        listeners.add(update);
        window.addEventListener('storage', onStorage);
        update();

        return () => {
            listeners.delete(update);
            window.removeEventListener('storage', onStorage);
        };
    }, [user]);

    return lines;
};
