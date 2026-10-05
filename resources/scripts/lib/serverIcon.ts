/** The server list icon: Minecraft reads a 64x64 PNG called server-icon.png from the server folder. */
import axios from 'axios';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import deleteFiles from '@/api/server/files/deleteFiles';

export const ICON_FILE = 'server-icon.png';
export const ICON_SIZE = 64;

/** Crops the middle square out of any image and scales it to the size Minecraft wants. */
export const toIconPng = async (file: File): Promise<Blob> => {
    const url = URL.createObjectURL(file);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('That file is not an image the browser can read.'));
            element.src = url;
        });

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = ICON_SIZE;
        const context = canvas.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        context.drawImage(
            image,
            (image.naturalWidth - side) / 2,
            (image.naturalHeight - side) / 2,
            side,
            side,
            0,
            0,
            ICON_SIZE,
            ICON_SIZE
        );

        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Could not convert the image.'))),
                'image/png'
            )
        );
    } finally {
        URL.revokeObjectURL(url);
    }
};

/** The icon the server currently has as an object URL, or null when there is none. */
export const fetchServerIcon = async (uuid: string): Promise<string | null> => {
    try {
        const response = await fetch(await getFileDownloadUrl(uuid, `/${ICON_FILE}`));
        if (!response.ok) return null;

        return URL.createObjectURL(await response.blob());
    } catch (e) {
        return null;
    }
};

export const uploadServerIcon = async (uuid: string, png: Blob): Promise<void> => {
    const url = await getFileUploadUrl(uuid);
    await axios.post(
        url,
        { files: new File([png], ICON_FILE, { type: 'image/png' }) },
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { directory: '/' } }
    );
};

export const deleteServerIcon = (uuid: string): Promise<void> => deleteFiles(uuid, '/', [ICON_FILE]);
