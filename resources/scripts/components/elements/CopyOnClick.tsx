import React, { useEffect, useState } from 'react';
import Fade from '@/components/elements/Fade';
import Portal from '@/components/elements/Portal';
import copy from 'copy-to-clipboard';
import classNames from 'classnames';
import { CheckCircleIcon } from '@heroicons/react/solid';

interface CopyOnClickProps {
    text: string | number | null | undefined;
    showInNotification?: boolean;
    children: React.ReactNode;
}

const CopyOnClick = ({ text, showInNotification = true, children }: CopyOnClickProps) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;

        const timeout = setTimeout(() => {
            setCopied(false);
        }, 2500);

        return () => {
            clearTimeout(timeout);
        };
    }, [copied]);

    if (!React.isValidElement(children)) {
        throw new Error('Component passed to <CopyOnClick/> must be a valid React element.');
    }

    const child = !text
        ? React.Children.only(children)
        : React.cloneElement(React.Children.only(children), {
              // @ts-expect-error todo: check on this
              className: classNames(children.props.className || '', 'cursor-pointer'),
              onClick: (e: React.MouseEvent<HTMLElement>) => {
                  copy(String(text));
                  setCopied(true);
                  if (typeof children.props.onClick === 'function') {
                      children.props.onClick(e);
                  }
              },
          });

    return (
        <>
            {copied && (
                <Portal>
                    <Fade in appear timeout={250} key={copied ? 'visible' : 'invisible'}>
                        <div className={'fixed z-50 bottom-0 right-0 m-4'}>
                            <div
                                className={
                                    'flex items-center rounded-xl py-3 px-4 bg-white border border-neutral-500 shadow-lg'
                                }
                            >
                                <CheckCircleIcon className={'w-5 h-5 text-green-600 mr-3 flex-shrink-0'} />
                                <p className={'text-sm text-neutral-50'}>
                                    {showInNotification
                                        ? `Copied "${String(text)}" to clipboard.`
                                        : 'Copied text to clipboard.'}
                                </p>
                            </div>
                        </div>
                    </Fade>
                </Portal>
            )}
            {child}
        </>
    );
};

export default CopyOnClick;
