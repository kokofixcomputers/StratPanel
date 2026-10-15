/**
 * The editor of the panel loads a whole file into the browser. The panel refuses files above 4 MiB by itself
 * (PTERODACTYL_FILES_MAX_EDIT_SIZE, config/pterodactyl.php), and the editor struggles well before a file is much bigger than
 * that, so a file above the limit is not opened at all: the person is told, and offered the download.
 */
export const MAX_EDIT_BYTES = 4 * 1024 * 1024;

/** Whether a file of this many bytes can be opened in the editor. Unknown sizes are tried, the panel has the last word. */
export const canEdit = (size: number | undefined, limit = MAX_EDIT_BYTES): boolean =>
    size === undefined || !(size > limit);

/** Whether the answer of the panel to a request for a file says the file is too big to edit. */
export const isTooLargeError = (error: unknown): boolean => {
    const response = (error as { response?: { data?: unknown } } | undefined)?.response;
    let data = response?.data;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            return false;
        }
    }
    const first = (data as { errors?: { code?: string }[] } | undefined)?.errors?.[0];

    return first?.code === 'FileSizeTooLargeException';
};
