import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_MESSAGE, PREVIEW_PARAM, READY_MESSAGE } from '@/lib/themePreview';
import { ThemeConfig } from '@/lib/themeConfig';

export type PreviewPage = 'dashboard' | 'server' | 'account' | 'login';

/**
 * The real panel in a frame, scaled to fit, that is sent the draft whenever it changes (the panel's side is lib/themePreview.ts). The frame
 * is drawn at the width of a desktop or a phone and shrunk, so the pages choose their layout as they would on such a screen.
 */
export default ({
    config,
    dark,
    page,
    serverId,
    phone,
}: {
    config: ThemeConfig;
    dark: boolean;
    page: PreviewPage;
    serverId: string | null;
    phone: boolean;
}) => {
    const frame = useRef<HTMLIFrameElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    const path =
        page === 'server' && serverId
            ? `/server/${serverId}`
            : page === 'account'
            ? '/account'
            : page === 'login'
            ? '/theme-preview/login'
            : '/';
    const src = `${path}?${PREVIEW_PARAM}=1`;

    const send = useCallback(() => {
        frame.current?.contentWindow?.postMessage({ type: DRAFT_MESSAGE, config, dark }, window.location.origin);
    }, [config, dark]);

    // Whenever the draft changes, and when the panel in the frame says it is ready (it was just loaded or reloaded).
    useEffect(send, [send]);
    useEffect(() => {
        const listen = (event: MessageEvent) => {
            if (event.origin === window.location.origin && event.data?.type === READY_MESSAGE) send();
        };
        window.addEventListener('message', listen);

        return () => window.removeEventListener('message', listen);
    }, [send]);

    useEffect(() => {
        if (!box.current) return;
        const observer = new ResizeObserver(([entry]) =>
            setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
        );
        observer.observe(box.current);

        return () => observer.disconnect();
    }, []);

    const frameWidth = phone ? 390 : 1280;
    const scale = size.width > 0 ? Math.min(1, size.width / frameWidth) : 1;
    const offset = Math.max(0, (size.width - frameWidth * scale) / 2);

    return (
        <div
            ref={box}
            className={'relative overflow-hidden rounded-2xl border border-neutral-500 bg-neutral-800'}
            style={{ height: 'calc(100vh - 9.5rem)', minHeight: '24rem' }}
        >
            <iframe
                key={src}
                ref={frame}
                src={src}
                title={'Preview'}
                onLoad={send}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: offset,
                    width: frameWidth,
                    height: size.height / scale,
                    border: 0,
                    transform: `scale(${scale})`,
                    transformOrigin: '0 0',
                    background: 'transparent',
                }}
            />
        </div>
    );
};
