import React from 'react';
import { Link, matchPath } from 'react-router-dom';
import { PORTED_PATTERNS } from '@/routers/adminRoutes';

/**
 * A link to a page of the admin area. One that is part of this app is a link inside the app, one that is not yet (the server still draws
 * it) is a normal link, so a page can be moved over without changing a link that points at it.
 */
export default ({ to, children, ...props }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    PORTED_PATTERNS.some((path) => matchPath(to.split('?')[0], { path, exact: true })) ? (
        <Link to={to} {...props}>
            {children}
        </Link>
    ) : (
        <a href={to} {...props}>
            {children}
        </a>
    );
