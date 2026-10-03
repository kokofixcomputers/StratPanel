import React, { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import tw from 'twin.macro';
import isEqual from 'react-fast-compare';

interface Props {
    icon?: IconProp;
    title: string | React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

const TitledGreyBox = ({ icon, title, children, className }: Props) => (
    <div css={tw`rounded-xl shadow-md bg-white border border-neutral-500`} className={className}>
        <div css={tw`rounded-t-xl px-5 py-4 border-b border-neutral-500`}>
            {typeof title === 'string' ? (
                <p css={tw`text-sm font-semibold text-neutral-50 flex items-center`}>
                    {icon && <FontAwesomeIcon icon={icon} css={tw`mr-2 text-primary-600`} />}
                    {title}
                </p>
            ) : (
                title
            )}
        </div>
        <div css={tw`p-5`}>{children}</div>
    </div>
);

export default memo(TitledGreyBox, isEqual);
