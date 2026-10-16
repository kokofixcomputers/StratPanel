import React from 'react';
import { getSlot, useExtensionRegistry } from '@/lib/extensions';

/** One component of an extension. If it crashes while it renders, it disappears and the page around it is not touched. */
export class ExtensionBoundary extends React.Component<
    { extension: string; children?: React.ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        // eslint-disable-next-line no-console
        console.error(`[extensions] A component of ${this.props.extension} crashed and was left out`, error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

/**
 * A place on a page where extensions can show something. Each component is on its own: a slot that has nothing in it is nothing,
 * and one that crashes does not take the others, or the page, with it.
 */
export default ({ name, ...props }: { name: string; [key: string]: unknown }) => {
    useExtensionRegistry();
    const entries = getSlot(name);
    if (!entries.length) return null;

    return React.createElement(
        React.Fragment,
        null,
        entries.map(({ extension, component }) =>
            React.createElement(
                ExtensionBoundary,
                { key: `${extension}:${name}`, extension },
                React.createElement(component, props)
            )
        )
    );
};
