/** @jest-environment jsdom */
import { addToCart, cartCount, clearCart, MAX_IN_CART, MAX_PER_PACKAGE, setQuantity } from './cart';

const lines = () => JSON.parse(localStorage.getItem('stratosphere:cart:u1') || '[]');

describe('cart', () => {
    beforeEach(() => {
        localStorage.clear();
        clearCart('u1');
    });

    it('puts packages in and counts them', () => {
        addToCart('u1', 'a');
        addToCart('u1', 'a');
        addToCart('u1', 'b');

        expect(lines()).toEqual([
            { package: 'a', quantity: 2 },
            { package: 'b', quantity: 1 },
        ]);
        expect(cartCount(lines())).toBe(3);
    });

    it('changes the quantity and takes a package out at zero', () => {
        addToCart('u1', 'a');
        setQuantity('u1', 'a', 4);
        expect(lines()).toEqual([{ package: 'a', quantity: 4 }]);
        setQuantity('u1', 'a', 0);
        expect(lines()).toEqual([]);
    });

    it('stays within the limits of one package and of the whole cart', () => {
        for (let i = 0; i < MAX_PER_PACKAGE + 3; i++) addToCart('u1', 'a');
        expect(lines()[0].quantity).toBe(MAX_PER_PACKAGE);
        expect(addToCart('u1', 'a')).toBe(false);

        setQuantity('u1', 'b', 10);
        setQuantity('u1', 'c', 10);
        expect(cartCount(lines())).toBe(MAX_IN_CART);
        expect(addToCart('u1', 'd')).toBe(false);
    });

    it('keeps a cart for every account', () => {
        addToCart('u1', 'a');
        addToCart('u2', 'z');
        expect(JSON.parse(localStorage.getItem('stratosphere:cart:u2') || '[]')).toEqual([
            { package: 'z', quantity: 1 },
        ]);
        expect(lines()).toEqual([{ package: 'a', quantity: 1 }]);
    });

    it('ignores what in the storage is not a cart', () => {
        localStorage.setItem('stratosphere:cart:u9', '{"nope":1}');
        expect(addToCart('u9', 'a')).toBe(true);
        localStorage.setItem('stratosphere:cart:u8', '[{"package":5,"quantity":2},{"package":"a","quantity":-1}]');
        expect(addToCart('u8', 'b')).toBe(true);
        expect(JSON.parse(localStorage.getItem('stratosphere:cart:u8') || '[]')).toEqual([
            { package: 'b', quantity: 1 },
        ]);
    });
});
