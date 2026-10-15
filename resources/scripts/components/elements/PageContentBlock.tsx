import React, { useEffect } from 'react';
import ContentContainer from '@/components/elements/ContentContainer';
import { CSSTransition } from 'react-transition-group';
import tw from 'twin.macro';
import FlashMessageRender from '@/components/FlashMessageRender';
import useBranding from '@/plugins/useBranding';
import { linksAt } from '@/lib/branding';

export interface PageContentBlockProps {
    title?: string;
    className?: string;
    showFlashKey?: string;
}

const PageContentBlock: React.FC<PageContentBlockProps> = ({ title, showFlashKey, className, children }) => {
    useEffect(() => {
        if (title) {
            document.title = title;
        }
    }, [title]);

    const footerLinks = linksAt(useBranding().links, 'footer');

    return (
        <CSSTransition timeout={150} classNames={'fade'} appear in>
            <>
                <ContentContainer css={tw`my-6 sm:my-10`} className={className}>
                    {showFlashKey && <FlashMessageRender byKey={showFlashKey} css={tw`mb-4`} />}
                    {children}
                </ContentContainer>
                <ContentContainer css={tw`mb-4`}>
                    {footerLinks.length > 0 && (
                        <p css={tw`text-center text-xs mb-1`}>
                            {footerLinks.map((link, index) => (
                                <React.Fragment key={`${link.url}:${index}`}>
                                    {index > 0 && <span css={tw`text-neutral-500`}>&nbsp;&middot;&nbsp;</span>}
                                    <a
                                        href={link.url}
                                        target={link.newTab ? '_blank' : undefined}
                                        rel={'noopener noreferrer'}
                                        css={tw`no-underline text-neutral-300 hover:text-neutral-50`}
                                    >
                                        {link.label}
                                    </a>
                                </React.Fragment>
                            ))}
                        </p>
                    )}
                    <p css={tw`text-center text-neutral-400 text-xs`}>
                        Stratosphere &copy; {new Date().getFullYear()}, built on&nbsp;
                        <a
                            rel={'noopener nofollow noreferrer'}
                            href={'https://pterodactyl.io'}
                            target={'_blank'}
                            css={tw`no-underline text-neutral-400 hover:text-neutral-200`}
                        >
                            Pterodactyl&reg;
                        </a>
                    </p>
                </ContentContainer>
            </>
        </CSSTransition>
    );
};

export default PageContentBlock;
