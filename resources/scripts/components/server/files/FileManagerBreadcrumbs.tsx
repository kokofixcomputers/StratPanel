import React, { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/solid';
import { encodePathSegments, hashToPath } from '@/helpers';
import tw from 'twin.macro';

interface Props {
    renderLeft?: JSX.Element;
    withinFileEditor?: boolean;
    isNewFile?: boolean;
}

const Separator = () => <ChevronRightIcon css={tw`w-4 h-4 mx-1 text-neutral-400 flex-shrink-0`} />;

export default ({ renderLeft, withinFileEditor, isNewFile }: Props) => {
    const [file, setFile] = useState<string | null>(null);
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const directory = ServerContext.useStoreState((state) => state.files.directory);
    const { hash } = useLocation();

    useEffect(() => {
        const path = hashToPath(hash);

        if (withinFileEditor && !isNewFile) {
            const name = path.split('/').pop() || null;
            setFile(name);
        }
    }, [withinFileEditor, isNewFile, hash]);

    const breadcrumbs = (): { name: string; path?: string }[] =>
        directory
            .split('/')
            .filter((directory) => !!directory)
            .map((directory, index, dirs) => {
                if (!withinFileEditor && index === dirs.length - 1) {
                    return { name: directory };
                }

                return { name: directory, path: `/${dirs.slice(0, index + 1).join('/')}` };
            });

    return (
        <div css={tw`flex flex-grow-0 items-center text-sm font-medium text-neutral-400 overflow-x-auto`}>
            {renderLeft}
            <NavLink
                to={`/server/${id}/files`}
                css={tw`inline-flex items-center text-primary-600 no-underline hover:text-primary-700`}
            >
                <HomeIcon css={tw`w-4 h-4 mr-1.5`} />
                Home
            </NavLink>
            {breadcrumbs().map((crumb, index) =>
                crumb.path ? (
                    <React.Fragment key={index}>
                        <Separator />
                        <NavLink
                            to={`/server/${id}/files#${encodePathSegments(crumb.path)}`}
                            css={tw`text-primary-600 no-underline hover:text-primary-700 whitespace-nowrap`}
                        >
                            {crumb.name}
                        </NavLink>
                    </React.Fragment>
                ) : (
                    <React.Fragment key={index}>
                        <Separator />
                        <span css={tw`text-neutral-100 whitespace-nowrap`}>{crumb.name}</span>
                    </React.Fragment>
                )
            )}
            {file && (
                <React.Fragment>
                    <Separator />
                    <span css={tw`text-neutral-100 whitespace-nowrap`}>{file}</span>
                </React.Fragment>
            )}
        </div>
    );
};
