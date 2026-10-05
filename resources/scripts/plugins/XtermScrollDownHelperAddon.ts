import { Terminal, ITerminalAddon } from 'xterm';

export class ScrollDownHelperAddon implements ITerminalAddon {
    private terminal: Terminal = new Terminal();
    private element?: HTMLDivElement;

    activate(terminal: Terminal): void {
        this.terminal = terminal;

        this.terminal.onScroll(() => {
            if (this.isScrolledDown()) {
                this.hide();
            }
        });

        this.terminal.onLineFeed(() => {
            if (!this.isScrolledDown()) {
                this.show();
            }
        });

        this.show();
    }

    dispose(): void {
        // ignore
    }

    show(): void {
        if (!this.terminal || !this.terminal.element) {
            return;
        }
        if (this.element) {
            this.element.style.visibility = 'visible';
            return;
        }

        this.terminal.element.style.position = 'relative';

        this.element = document.createElement('div');
        this.element.title = 'Jump to the latest output';
        this.element.innerHTML =
            '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
        this.element.style.position = 'absolute';
        this.element.style.right = '1.5rem';
        this.element.style.bottom = '.75rem';
        this.element.style.display = 'flex';
        this.element.style.alignItems = 'center';
        this.element.style.justifyContent = 'center';
        this.element.style.width = '2.25rem';
        this.element.style.height = '2.25rem';
        this.element.style.borderRadius = '0.5rem';
        this.element.style.border = '1px solid #dbe2ee';
        this.element.style.color = '#1447e6';
        this.element.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        this.element.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.12)';
        this.element.style.zIndex = '999';
        this.element.style.cursor = 'pointer';

        this.element.addEventListener('click', () => {
            this.terminal.scrollToBottom();
        });

        this.terminal.element.appendChild(this.element);
    }

    hide(): void {
        if (this.element) {
            this.element.style.visibility = 'hidden';
        }
    }

    isScrolledDown(): boolean {
        return this.terminal.buffer.active.viewportY === this.terminal.buffer.active.baseY;
    }
}
