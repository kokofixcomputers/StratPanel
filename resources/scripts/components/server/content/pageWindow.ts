/** The numbers to show for a page: the first, the last and the ones around the current, with gaps marked as null. */
export const pageWindow = (page: number, pages: number): (number | null)[] => {
    const wanted = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
    const numbers = Array.from(wanted)
        .filter((n) => n >= 1 && n <= pages)
        .sort((a, b) => a - b);

    return numbers.flatMap((n, i) => (i > 0 && n - numbers[i - 1] > 1 ? [null, n] : [n]));
};
