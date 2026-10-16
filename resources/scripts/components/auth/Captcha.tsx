import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import Reaptcha from 'reaptcha';
import { useStoreState } from 'easy-peasy';

export interface CaptchaHandle {
    /** Runs the check (invisible, or a small challenge when the service wants one) and resolves with the answer for the server. */
    execute: () => Promise<string>;
    reset: () => void;
}

interface Pending {
    resolve: (token: string) => void;
    reject: (error: Error) => void;
}

interface TurnstileApi {
    render: (container: HTMLElement, options: Record<string, unknown>) => string;
    execute: (widget: string) => void;
    reset: (widget: string) => void;
    remove: (widget: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScript: Promise<TurnstileApi> | undefined;

/** Loads the script of Turnstile once, however many forms ask for it. */
export const loadTurnstile = (): Promise<TurnstileApi> => {
    if (window.turnstile) return Promise.resolve(window.turnstile);

    if (!turnstileScript) {
        turnstileScript = new Promise<TurnstileApi>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = TURNSTILE_SCRIPT;
            script.async = true;
            script.onload = () =>
                window.turnstile ? resolve(window.turnstile) : reject(new Error('The captcha could not be loaded.'));
            script.onerror = () => {
                turnstileScript = undefined;
                reject(new Error('The captcha could not be loaded. Check your connection and reload the page.'));
            };
            document.head.appendChild(script);
        });
    }

    return turnstileScript;
};

const RecaptchaWidget = forwardRef<CaptchaHandle, { siteKey: string }>(({ siteKey }, ref) => {
    const widget = useRef<Reaptcha>(null);
    const pending = useRef<Pending>();

    useImperativeHandle(ref, () => ({
        execute: () =>
            new Promise<string>((resolve, reject) => {
                pending.current = { resolve, reject };
                widget.current!.execute().catch(reject);
            }),
        reset: () => {
            widget.current?.reset();
        },
    }));

    return (
        <Reaptcha
            ref={widget}
            size={'invisible'}
            sitekey={siteKey || '_invalid_key'}
            onVerify={(token) => {
                pending.current?.resolve(token);
                pending.current = undefined;
            }}
            onExpire={() => {
                pending.current?.reject(new Error('The captcha expired. Try again.'));
                pending.current = undefined;
            }}
            onError={() => {
                pending.current?.reject(new Error('The captcha failed. Reload the page and try again.'));
                pending.current = undefined;
            }}
        />
    );
});

const TurnstileWidget = forwardRef<CaptchaHandle, { siteKey: string }>(({ siteKey }, ref) => {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<Promise<string>>();
    const pending = useRef<Pending>();

    useEffect(() => {
        const fail = (message: string) => {
            pending.current?.reject(new Error(message));
            pending.current = undefined;
        };

        // Nothing is solved until execute() is called: the widget only draws something when Cloudflare wants an interaction.
        widget.current = loadTurnstile().then((api) =>
            api.render(container.current!, {
                sitekey: siteKey,
                execution: 'execute',
                appearance: 'interaction-only',
                callback: (token: string) => {
                    pending.current?.resolve(token);
                    pending.current = undefined;
                },
                'error-callback': () => fail('The captcha failed. Reload the page and try again.'),
                'expired-callback': () => fail('The captcha expired. Try again.'),
                'timeout-callback': () => fail('The captcha timed out. Try again.'),
            })
        );
        widget.current.catch(() => undefined);

        return () => {
            const current = widget.current;
            widget.current = undefined;
            current?.then((id) => window.turnstile?.remove(id)).catch(() => undefined);
        };
    }, [siteKey]);

    useImperativeHandle(ref, () => ({
        execute: () =>
            new Promise<string>((resolve, reject) => {
                if (!widget.current) return reject(new Error('The captcha is not ready.'));

                widget.current
                    .then((id) => {
                        pending.current = { resolve, reject };
                        window.turnstile!.reset(id);
                        window.turnstile!.execute(id);
                    })
                    .catch(reject);
            }),
        reset: () => {
            widget.current?.then((id) => window.turnstile?.reset(id)).catch(() => undefined);
        },
    }));

    // When Cloudflare needs the person to do something it is shown here.
    return <div ref={container} className={'mt-4 flex justify-center'} />;
});

/** The captcha chosen under Settings > Authentication, or nothing. Use it through useCaptcha(). */
export const Captcha = forwardRef<CaptchaHandle>((_, ref) => {
    const settings = useStoreState((state) => state.settings.data!);
    const provider = settings.captcha?.provider ?? (settings.recaptcha?.enabled ? 'recaptcha' : 'none');
    const siteKey = settings.captcha?.siteKey ?? settings.recaptcha?.siteKey ?? '';

    if (provider === 'turnstile') return <TurnstileWidget ref={ref} siteKey={siteKey} />;
    if (provider === 'recaptcha') return <RecaptchaWidget ref={ref} siteKey={siteKey} />;

    return null;
});

/**
 * For a form: render <Captcha ref={captcha.ref} /> and call `await captcha.run()` before sending it. The answer is undefined
 * when there is no captcha. If the check fails the promise rejects with a sentence for the person.
 */
export const useCaptcha = () => {
    const ref = useRef<CaptchaHandle>(null);
    const settings = useStoreState((state) => state.settings.data!);
    const enabled = (settings.captcha?.provider ?? (settings.recaptcha?.enabled ? 'recaptcha' : 'none')) !== 'none';

    const run = useCallback(
        async (): Promise<string | undefined> => (enabled && ref.current ? ref.current.execute() : undefined),
        [enabled]
    );
    const reset = useCallback(() => ref.current?.reset(), []);

    return { ref, enabled, run, reset };
};

export default Captcha;
