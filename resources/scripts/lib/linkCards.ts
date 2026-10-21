/** How many go side by side: as many as fit up to `max`, and when there are more they are spread over equal rows (6 links are 3 and 3, not 5 and 1). */
export const columnsFor = (count: number, max: number): number => {
    const rows = Math.ceil(count / max);

    return Math.max(1, Math.ceil(count / rows));
};
