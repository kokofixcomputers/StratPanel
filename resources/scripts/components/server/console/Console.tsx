import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IMarker, ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { ScrollDownHelperAddon } from '@/plugins/XtermScrollDownHelperAddon';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import { theme as th } from 'twin.macro';
import useEventListener from '@/plugins/useEventListener';
import { debounce } from 'debounce';
import { usePersistedState } from '@/plugins/usePersistedState';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import classNames from 'classnames';
import { commonPrefix, complete } from '@/lib/commandComplete';
import { isBridgeLine, isProbeNoise } from '@/lib/bridge';
import { useOnlinePlayers } from '@/lib/onlinePlayers';
import useCommandTree from '@/components/server/console/useCommandTree';
import {
    ArrowDownIcon,
    ArrowsExpandIcon,
    CheckIcon,
    ChevronDoubleRightIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardCopyIcon,
    SearchIcon,
    XIcon,
} from '@heroicons/react/solid';
import copy from 'copy-to-clipboard';
import { ChunkState, colorize, Level, nextChunk, stripAnsi } from '@/components/server/console/consoleChunks';
import {
    appendLog,
    clearLog,
    LogEntry,
    LogFilter,
    logCounts,
    matchesFilter,
    readLog,
    useLogVersion,
} from '@/lib/consoleLog';

import WorldClockPill from '@/components/server/console/WorldClockPill';
import { currentTheme, Theme, useTheme } from '@/lib/theme';
import { censorText, privacyOn, usePrivacy } from '@/lib/privacy';
import 'xterm/css/xterm.css';
import styles from './style.module.css';

const lightTheme = {
    background: '#ffffff',
    foreground: '#1f2937',
    cursor: 'transparent',
    black: '#1f2937',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#d97706',
    blue: '#1447e6',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#6b7280',
    brightBlack: '#9ca3af',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#111827',
    selection: 'rgba(20, 71, 230, 0.2)',
};

// The same colours for a dark surface (the background is the one of the cards): black text is light, the others are lighter so they can be
// read on it.
const darkTheme = {
    background: '#141a23',
    foreground: '#e2e8f0',
    cursor: 'transparent',
    black: '#94a3b8',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#7aa2ff',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#cbd5e1',
    brightBlack: '#64748b',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fcd34d',
    brightBlue: '#9db8ff',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
    selection: 'rgba(91, 134, 247, 0.35)',
};

const terminalTheme = (mode: Theme) => (mode === 'dark' ? darkTheme : lightTheme);

const terminalProps: ITerminalOptions = {
    disableStdin: true,
    cursorStyle: 'underline',
    allowTransparency: true,
    fontSize: 12,
    fontFamily: th('fontFamily.mono'),
    rows: 30,
    // The console keeps more than the default thousand lines, a filter writes them again from the log of the server.
    scrollback: 3000,
    theme: lightTheme,
};

interface Chunk {
    id: number;
    level: Level;
    text: string;
    marker?: IMarker;
}

export default () => {
    const TERMINAL_PRELUDE = '\u001b[1m\u001b[33mcontainer@pterodactyl~ \u001b[0m';
    const ref = useRef<HTMLDivElement>(null);
    const { theme: mode } = useTheme();
    const terminal = useMemo(() => new Terminal({ ...terminalProps, theme: terminalTheme(currentTheme()) }), []);
    // The colours of the console follow the theme of the panel when it changes.
    useEffect(() => {
        terminal.setOption('theme', terminalTheme(mode));
    }, [terminal, mode]);
    const fitAddon = new FitAddon();
    // The addon that is actually attached to the terminal, a new one is created on every render.
    const activeFit = useRef<FitAddon>();
    const [expanded, setExpanded] = useState(false);
    const searchAddon = new SearchAddon();
    const activeSearch = useRef<SearchAddon>();
    const searchInput = useRef<HTMLInputElement>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);

    // Warnings and errors are tracked as chunks so they can be copied with a single click.
    const overlay = useRef<HTMLDivElement>(null);
    const chunkState = useRef<ChunkState | null>(null);
    const chunks = useRef<Chunk[]>([]);
    const chunkSeq = useRef(0);
    const frame = useRef(0);
    // With auto scroll off the view stays where the user left it instead of following new output.
    const [autoScroll, setAutoScroll] = useState(true);
    const autoScrollRef = useRef(true);
    const pin = useRef<IMarker | null>(null);
    const lastUserScroll = useRef(0);
    const [buttons, setButtons] = useState<{ id: number; top: number }[]>([]);
    const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
    // Which lines are shown: all of them, or only the info, warning or error ones.
    const [filter, setFilter] = useState<LogFilter>('all');
    const filterRef = useRef<LogFilter>('all');
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();
    const scrollDownHelperAddon = new ScrollDownHelperAddon();
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const [canSendCommands] = usePermissions(['control.console']);
    const serverId = ServerContext.useStoreState((state) => state.server.data!.id);
    const serverUuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const commands = useCommandTree(serverUuid);
    const { online } = useOnlinePlayers(serverUuid);
    const isTransferring = ServerContext.useStoreState((state) => state.server.data!.isTransferring);
    const { entries: logEntries, version: logVersion } = useLogVersion(serverUuid);
    const counts = useMemo(() => logCounts(logEntries), [logEntries, logVersion]);
    const [history, setHistory] = usePersistedState<string[]>(`${serverId}:command_history`, []);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const updateButtons = () => {
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            const rows = terminal.element?.querySelector('.xterm-screen') as HTMLElement | null;
            if (!rows || !overlay.current) return;

            const cell = rows.clientHeight / terminal.rows;
            const origin = rows.getBoundingClientRect().top - overlay.current.getBoundingClientRect().top;
            const viewportY = terminal.buffer.active.viewportY;

            const next = chunks.current
                .filter((c) => c.marker && !c.marker.isDisposed)
                .map((c) => ({ id: c.id, top: origin + (c.marker!.line - viewportY) * cell }))
                .filter((b) => b.top >= origin - cell / 2 && b.top < origin + rows.clientHeight - cell / 2);

            setButtons((prev) =>
                prev.length === next.length && prev.every((b, i) => b.id === next[i].id && b.top === next[i].top)
                    ? prev
                    : next
            );
        });
    };

    const pinViewport = () => {
        const buffer = terminal.buffer.active;
        pin.current?.dispose();
        pin.current = terminal.registerMarker(buffer.viewportY - (buffer.baseY + buffer.cursorY)) || null;
    };

    const keepPosition = () => {
        if (autoScrollRef.current) return;
        terminal.scrollToLine(pin.current && !pin.current.isDisposed ? Math.max(pin.current.line, 0) : 0);
    };

    /** Writes one line to the terminal, and gives the first line of a warning or error its copy button. */
    const emit = (entry: LogEntry) => {
        if (entry.start && entry.level !== 'info') {
            const chunk: Chunk = { id: ++chunkSeq.current, level: entry.level, text: entry.plain };
            chunks.current = [...chunks.current.slice(-299), chunk];
            // The callback runs once everything written before this has been parsed, so the marker lands on the
            // row where the first line of the chunk is about to be printed.
            terminal.write('\u001b[0m', () => {
                chunk.marker = terminal.registerMarker(0);
                chunk.marker?.onDispose(() => {
                    chunks.current = chunks.current.filter((c) => c.id !== chunk.id);
                    updateButtons();
                });
                updateButtons();
            });
        } else if (entry.belongs && chunks.current.length) {
            chunks.current[chunks.current.length - 1].text += '\n' + entry.plain;
        }

        // Addresses in the lines of the log (a player joining shows where from) are hidden while that setting is on.
        terminal.writeln(privacyOn() ? censorText(entry.text) : entry.text, keepPosition);
    };

    /** Keeps the line in the log of the server, and shows it when the filter lets it through. */
    const record = (entry: LogEntry) => {
        appendLog(serverUuid, entry);
        if (matchesFilter(filterRef.current, entry.level)) emit(entry);
    };

    // A line made by the panel itself.
    const note = (text: string, level: LogEntry['level'] = 'info') =>
        record({ text, plain: stripAnsi(text), level, start: false, belongs: false });

    const handleConsoleOutput = (line: string, prelude = false) => {
        // Messages from the plugin to the panel are not for people to read.
        if (!prelude && (isBridgeLine(line) || isProbeNoise(line))) return;

        const text = line.replace(/(?:\r\n|\r|\n)$/im, '');
        if (prelude) {
            chunkState.current = null;
            note(TERMINAL_PRELUDE + text + '\u001b[0m');
            return;
        }

        const plain = stripAnsi(text);
        const { state, start, belongs } = nextChunk(chunkState.current, plain);
        chunkState.current = state;

        const inChunk = !!state && belongs;
        record({
            text: inChunk ? colorize(text, state!.level) : text + '\u001b[0m',
            plain,
            level: inChunk ? state!.level : 'info',
            start: start && !!state,
            belongs,
        });
    };

    /** Draws the terminal again with the lines the filter lets through. */
    const redraw = () => {
        terminal.clear();
        chunks.current = [];
        updateButtons();
        readLog(serverUuid).forEach((entry) => matchesFilter(filterRef.current, entry.level) && emit(entry));
        if (autoScrollRef.current) terminal.scrollToBottom();
    };

    // What is already on the screen is drawn again when the setting to hide addresses is turned on or off.
    const [hideSensitive] = usePrivacy();
    const privacyShown = useRef(hideSensitive);
    useEffect(() => {
        if (privacyShown.current === hideSensitive) return;
        privacyShown.current = hideSensitive;
        redraw();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hideSensitive]);

    const applyFilter = (next: LogFilter) => {
        if (next === filterRef.current) return;
        filterRef.current = next;
        setFilter(next);
        redraw();
    };

    const copyChunk = (id: number) => {
        const chunk = chunks.current.find((c) => c.id === id);
        if (!chunk) return;

        copy(chunk.text);
        setCopiedChunk(id);
        setTimeout(() => setCopiedChunk((current) => (current === id ? null : current)), 1500);
    };

    const runSearch = (query: string, direction: 'next' | 'previous' = 'next', incremental = false) => {
        if (!activeSearch.current) return;
        if (!query) {
            terminal.clearSelection();
            return;
        }

        const options = { caseSensitive, incremental };
        direction === 'next'
            ? activeSearch.current.findNext(query, options)
            : activeSearch.current.findPrevious(query, options);
    };

    const closeSearch = () => {
        setSearchOpen(false);
        terminal.clearSelection();
    };

    const handleTransferStatus = (status: string) => {
        switch (status) {
            // Sent by either the source or target node if a failure occurs.
            case 'failure':
                note(TERMINAL_PRELUDE + 'Transfer has failed.\u001b[0m', 'error');
                return;
        }
    };

    const handleDaemonErrorOutput = (line: string) =>
        note(
            TERMINAL_PRELUDE + '\u001b[1m\u001b[41m\u001b[97m' + line.replace(/(?:\r\n|\r|\n)$/im, '') + '\u001b[0m',
            'error'
        );

    const handlePowerChangeEvent = (state: string) =>
        note(TERMINAL_PRELUDE + 'Server marked as ' + state + '...\u001b[0m');

    // Tab completion: the candidates for the word being typed, and which one Tab has cycled to.
    const [suggest, setSuggest] = useState<{
        items: string[];
        start: number;
        hint: string | null;
        active: number;
        descriptions?: Record<string, string>;
    }>({
        items: [],
        start: 0,
        hint: null,
        active: -1,
    });
    const closeSuggest = () => setSuggest({ items: [], start: 0, hint: null, active: -1 });
    const updateSuggest = (value: string) => {
        if (!value.trim()) return closeSuggest();
        setSuggest({ ...complete(value, commands?.tree, online), active: -1 });
    };
    const applySuggestion = (input: HTMLInputElement, item: string, finish: boolean) => {
        input.value = input.value.slice(0, suggest.start) + item + (finish ? ' ' : '');
        input.focus();
    };

    const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape' && suggest.items.length) {
            e.stopPropagation();
            return closeSuggest();
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const input = e.currentTarget;
            const { items, start } = suggest;
            if (!items.length) return updateSuggest(input.value);

            if (items.length === 1) {
                applySuggestion(input, items[0], true);
                return updateSuggest(input.value);
            }

            // Complete as far as the candidates agree first, then cycle through them.
            const typed = input.value.slice(start);
            const shared = commonPrefix(items);
            if (suggest.active < 0 && shared.length > typed.length) {
                applySuggestion(input, shared, false);
                return updateSuggest(input.value);
            }

            const active = (suggest.active + (e.shiftKey ? items.length - 1 : 1)) % items.length;
            applySuggestion(input, items[active], false);
            return setSuggest({ ...suggest, active });
        }

        if (e.key === 'ArrowUp') {
            const newIndex = Math.min(historyIndex + 1, history!.length - 1);

            setHistoryIndex(newIndex);
            e.currentTarget.value = history![newIndex] || '';

            // By default up arrow will also bring the cursor to the start of the line,
            // so we'll preventDefault to keep it at the end.
            e.preventDefault();
        }

        if (e.key === 'ArrowDown') {
            const newIndex = Math.max(historyIndex - 1, -1);

            setHistoryIndex(newIndex);
            e.currentTarget.value = history![newIndex] || '';
        }

        const command = e.currentTarget.value;
        if (e.key === 'Enter' && command.length > 0) {
            setHistory((prevHistory) => [command, ...prevHistory!].slice(0, 32));
            setHistoryIndex(-1);

            instance && instance.send('send command', command);
            e.currentTarget.value = '';
            closeSuggest();
        }
    };

    useEffect(() => {
        if (connected && ref.current && !terminal.element) {
            terminal.loadAddon(fitAddon);
            activeFit.current = fitAddon;
            terminal.loadAddon(searchAddon);
            activeSearch.current = searchAddon;
            terminal.loadAddon(webLinksAddon);
            terminal.loadAddon(unicode11Addon);
            terminal.loadAddon(scrollDownHelperAddon);

            terminal.open(ref.current);

            // Activate Unicode 11 for proper emoji and special character width handling
            terminal.unicode.activeVersion = '11';

            fitAddon.fit();
            terminal.onScroll(updateButtons);
            terminal.onRender(updateButtons);
            terminal.onResize(updateButtons);

            // Add support for capturing keys
            terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    document.execCommand('copy');
                    return false;
                } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    setSearchOpen(true);
                    setTimeout(() => searchInput.current?.select(), 0);
                    return false;
                }
                return true;
            });
        }
    }, [terminal, connected]);

    useEventListener(
        'resize',
        debounce(() => {
            if (terminal.element) {
                activeFit.current?.fit();
            }
        }, 100)
    );

    useEffect(() => {
        const listeners: Record<string, (s: string) => void> = {
            [SocketEvent.STATUS]: handlePowerChangeEvent,
            [SocketEvent.CONSOLE_OUTPUT]: handleConsoleOutput,
            [SocketEvent.INSTALL_OUTPUT]: handleConsoleOutput,
            [SocketEvent.TRANSFER_LOGS]: handleConsoleOutput,
            [SocketEvent.TRANSFER_STATUS]: handleTransferStatus,
            [SocketEvent.DAEMON_MESSAGE]: (line) => handleConsoleOutput(line, true),
            [SocketEvent.DAEMON_ERROR]: handleDaemonErrorOutput,
        };

        if (connected && instance) {
            // Do not clear the console if the server is being transferred.
            if (!isTransferring) {
                terminal.clear();
                chunks.current = [];
                chunkState.current = null;
                clearLog(serverUuid);
                updateButtons();
            }

            Object.keys(listeners).forEach((key: string) => {
                instance.addListener(key, listeners[key]);
            });
            instance.send(SocketRequest.SEND_LOGS);
        }

        return () => {
            if (instance) {
                Object.keys(listeners).forEach((key: string) => {
                    instance.removeListener(key, listeners[key]);
                });
            }
        };
    }, [connected, instance]);

    const applyAutoScroll = (next: boolean) => {
        autoScrollRef.current = next;
        setAutoScroll(next);
        if (next) {
            pin.current?.dispose();
            pin.current = null;
        } else {
            pinViewport();
        }
    };

    // Scrolling up by hand turns auto scroll off, returning to the bottom turns it back on. With it off, the
    // position the user scrolled to is remembered so new output does not pull the view away.
    useEffect(() => {
        // xterm's own scroll event only fires for output, so user scrolling is read from its viewport element.
        const viewport = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null;
        if (!viewport) return;

        const onScroll = () => {
            if (Date.now() - lastUserScroll.current > 400) return;

            const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
            if (atBottom && !autoScrollRef.current) applyAutoScroll(true);
            else if (!atBottom && autoScrollRef.current) applyAutoScroll(false);
            else if (!autoScrollRef.current) pinViewport();
        };
        viewport.addEventListener('scroll', onScroll, { passive: true });

        return () => viewport.removeEventListener('scroll', onScroll);
    }, [terminal, connected]);

    const stampUserScroll = () => {
        lastUserScroll.current = Date.now();
    };

    const toggleAutoScroll = () => {
        const next = !autoScroll;
        applyAutoScroll(next);
        if (next) terminal.scrollToBottom();
    };

    // Go full screen: lock page scrolling, use a bigger font and let xterm recalculate its rows and columns.
    useEffect(() => {
        if (!expanded) return;

        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);

        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [expanded]);

    useEffect(() => {
        terminal.options.fontSize = expanded ? 15 : 12;
        // Wait for the layout to change before measuring.
        const timer = setTimeout(() => terminal.element && activeFit.current?.fit(), 50);

        return () => clearTimeout(timer);
    }, [expanded, terminal]);

    return (
        <div className={classNames(styles.terminal, 'relative', { [styles.expanded]: expanded })}>
            {searchOpen ? (
                <div className={styles.search_bar}>
                    <SearchIcon className={'w-4 h-4 text-neutral-400 flex-shrink-0'} />
                    <input
                        ref={searchInput}
                        autoFocus
                        value={searchQuery}
                        placeholder={'Search console...'}
                        aria-label={'Search console'}
                        onChange={(e) => {
                            setSearchQuery(e.currentTarget.value);
                            runSearch(e.currentTarget.value, 'next', true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') runSearch(searchQuery, e.shiftKey ? 'previous' : 'next');
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                closeSearch();
                            }
                        }}
                    />
                    <button
                        type={'button'}
                        title={'Match case'}
                        aria-pressed={caseSensitive}
                        onClick={() => {
                            setCaseSensitive((v) => !v);
                            setTimeout(() => runSearch(searchQuery, 'next', true), 0);
                        }}
                        className={classNames(styles.search_icon, { [styles.search_active]: caseSensitive })}
                    >
                        Aa
                    </button>
                    <button
                        type={'button'}
                        title={'Previous match (Shift+Enter)'}
                        onClick={() => runSearch(searchQuery, 'previous')}
                        className={styles.search_icon}
                    >
                        <ChevronUpIcon className={'w-4 h-4'} />
                    </button>
                    <button
                        type={'button'}
                        title={'Next match (Enter)'}
                        onClick={() => runSearch(searchQuery, 'next')}
                        className={styles.search_icon}
                    >
                        <ChevronDownIcon className={'w-4 h-4'} />
                    </button>
                    <button type={'button'} title={'Close (Esc)'} onClick={closeSearch} className={styles.search_icon}>
                        <XIcon className={'w-4 h-4'} />
                    </button>
                </div>
            ) : (
                <button
                    type={'button'}
                    onClick={() => {
                        setSearchOpen(true);
                        setTimeout(() => searchInput.current?.focus(), 0);
                    }}
                    title={'Search (Ctrl+F)'}
                    aria-label={'Search console'}
                    className={classNames(styles.expand_button, styles.search_button)}
                >
                    <SearchIcon className={'w-5 h-5'} />
                </button>
            )}
            {!searchOpen && (
                <button
                    type={'button'}
                    onClick={toggleAutoScroll}
                    aria-pressed={autoScroll}
                    title={autoScroll ? 'Auto scroll is on' : 'Auto scroll is off'}
                    className={classNames(
                        styles.auto_scroll,
                        autoScroll ? styles.auto_scroll_on : styles.auto_scroll_off
                    )}
                >
                    <ArrowDownIcon className={'w-4 h-4'} />
                    Auto Scroll
                </button>
            )}
            <button
                type={'button'}
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
                aria-label={expanded ? 'Exit full screen' : 'Enter full screen'}
                className={styles.expand_button}
            >
                {expanded ? <XIcon className={'w-5 h-5'} /> : <ArrowsExpandIcon className={'w-5 h-5'} />}
            </button>
            <WorldClockPill />
            <SpinnerOverlay visible={!connected} size={'large'} />
            <div className={styles.filter_bar} role={'group'} aria-label={'Show console lines'}>
                {(
                    [
                        ['all', 'All'],
                        ['info', 'Info'],
                        ['warn', 'Warning'],
                        ['error', 'Error'],
                    ] as const
                ).map(([id, label]) => {
                    const count = id === 'warn' ? counts.warn : id === 'error' ? counts.error : 0;

                    return (
                        <button
                            key={id}
                            type={'button'}
                            aria-pressed={filter === id}
                            onClick={() => applyFilter(id)}
                            className={classNames(styles.filter_pill, {
                                [styles.filter_pill_on]: filter === id,
                                [styles.filter_pill_warn]: id === 'warn' && count > 0 && filter !== id,
                                [styles.filter_pill_error]: id === 'error' && count > 0 && filter !== id,
                            })}
                        >
                            {label}
                            {count > 0 && <span className={styles.filter_count}>{count > 99 ? '99+' : count}</span>}
                        </button>
                    );
                })}
            </div>
            <div className={styles.container}>
                <div
                    className={'h-full relative'}
                    ref={overlay}
                    onWheelCapture={stampUserScroll}
                    onMouseDownCapture={stampUserScroll}
                    onTouchMoveCapture={stampUserScroll}
                    onKeyDownCapture={stampUserScroll}
                >
                    <div id={styles.terminal} ref={ref} />
                    {buttons.map((b) => (
                        <button
                            key={b.id}
                            type={'button'}
                            title={'Copy this block'}
                            aria-label={'Copy this block'}
                            onClick={() => copyChunk(b.id)}
                            className={styles.copy_chunk}
                            style={{ top: b.top }}
                        >
                            {copiedChunk === b.id ? (
                                <CheckIcon className={'w-3.5 h-3.5 text-green-600'} />
                            ) : (
                                <ClipboardCopyIcon className={'w-3.5 h-3.5'} />
                            )}
                        </button>
                    ))}
                </div>
            </div>
            {canSendCommands && (
                <div className={'relative'}>
                    <input
                        className={classNames('peer', styles.command_input)}
                        type={'text'}
                        placeholder={'Type a command...'}
                        aria-label={'Console command input.'}
                        disabled={!instance || !connected}
                        onKeyDown={handleCommandKeyDown}
                        onChange={(e) => updateSuggest(e.currentTarget.value)}
                        onBlur={() => setTimeout(closeSuggest, 150)}
                        autoCorrect={'off'}
                        autoCapitalize={'none'}
                    />
                    {(suggest.items.length > 0 || suggest.hint) && (
                        <div className={styles.suggestions}>
                            {suggest.items.length === 0 && (
                                <span className={styles.suggestion_hint}>&lt;{suggest.hint}&gt;</span>
                            )}
                            {suggest.items.slice(0, 40).map((item, index) => (
                                <button
                                    key={item}
                                    type={'button'}
                                    title={suggest.descriptions?.[item]}
                                    className={classNames(styles.suggestion, {
                                        [styles.suggestion_active]: index === suggest.active,
                                    })}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        const input = e.currentTarget
                                            .closest('div')!
                                            .parentElement!.querySelector('input')!;
                                        applySuggestion(input, item, true);
                                        updateSuggest(input.value);
                                    }}
                                >
                                    {item}
                                </button>
                            ))}
                            {suggest.items.length > 0 && (
                                <span className={styles.suggestion_hint}>
                                    Tab to complete
                                    {commands?.stale ? ' · command list may be out of date, restart to refresh' : ''}
                                </span>
                            )}
                        </div>
                    )}
                    <div className={classNames('text-neutral-400 peer-focus:text-primary-600', styles.command_icon)}>
                        <ChevronDoubleRightIcon className={'w-4 h-4'} />
                    </div>
                </div>
            )}
        </div>
    );
};
