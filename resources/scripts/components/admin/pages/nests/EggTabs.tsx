import React from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';

/** The tabs of the pages of one egg. */
export default ({ id }: { id: number | string }) => (
    <nav className={'mb-5 flex flex-wrap gap-1 border-b border-neutral-500'}>
        {[
            ['', 'Configuration'],
            ['/variables', 'Variables'],
            ['/scripts', 'Install script'],
        ].map(([path, name]) => (
            <NavLink
                key={path}
                to={`/admin/nests/egg/${id}${path}`}
                exact
                className={classNames(
                    'rounded-t-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                    'text-neutral-300 hover:text-neutral-50'
                )}
                activeClassName={'border-b-2 border-primary-600 !text-primary-700'}
            >
                {name}
            </NavLink>
        ))}
    </nav>
);
