import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all';
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution';
import styled from 'styled-components/macro';
import tw from 'twin.macro';

// Language services (JSON/TS validation, etc.) are not needed for a config file editor, so everything runs
// without web workers and only uses the Monarch syntax highlighters bundled in "basic-languages".
(self as any).MonacoEnvironment = {
    getWorker: () => {
        const blob = new Blob([''], { type: 'application/javascript' });

        return new Worker(URL.createObjectURL(blob));
    },
};

// Monaco ships JSON and TOML only as worker based language services, which we don't bundle. A small Monarch
// tokenizer is enough for syntax highlighting of config files, so register both ourselves.
monaco.languages.register({
    id: 'json',
    extensions: ['.json', '.jsonc', '.json5', '.mcmeta'],
    aliases: ['JSON', 'json'],
    mimetypes: ['application/json'],
});
monaco.languages.setLanguageConfiguration('json', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
        ['{', '}'],
        ['[', ']'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string'] },
        { open: '[', close: ']', notIn: ['string'] },
        { open: '"', close: '"', notIn: ['string'] },
    ],
});
monaco.languages.setMonarchTokensProvider('json', {
    defaultToken: '',
    tokenPostfix: '.json',
    tokenizer: {
        root: [
            [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'string.key'],
            [/"(?:[^"\\]|\\.)*"/, 'string.value'],
            [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
            [/\b(?:true|false|null)\b/, 'keyword'],
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],
            [/[{}[\]]/, '@brackets'],
            [/[,:]/, 'delimiter'],
        ],
        comment: [
            [/[^/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[/*]/, 'comment'],
        ],
    },
});

monaco.languages.register({
    id: 'toml',
    extensions: ['.toml'],
    aliases: ['TOML', 'toml'],
    mimetypes: ['application/toml'],
});
monaco.languages.setLanguageConfiguration('toml', {
    comments: { lineComment: '#' },
    brackets: [
        ['{', '}'],
        ['[', ']'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string'] },
        { open: '[', close: ']', notIn: ['string'] },
        { open: '"', close: '"', notIn: ['string'] },
        { open: "'", close: "'", notIn: ['string'] },
    ],
});
monaco.languages.setMonarchTokensProvider('toml', {
    defaultToken: '',
    tokenPostfix: '.toml',
    tokenizer: {
        root: [
            [/#.*$/, 'comment'],
            [/^\s*\[\[?[^\]]+\]\]?/, 'type'],
            [/^\s*(?:"[^"]*"|'[^']*'|[\w.-]+)(?=\s*=)/, 'attribute.name'],
            [/"""/, 'string', '@multiline'],
            [/"(?:[^"\\]|\\.)*"/, 'string'],
            [/'[^']*'/, 'string'],
            [/\b\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?\b/, 'number'],
            [/[+-]?(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/, 'number'],
            [/\b(?:true|false)\b/, 'keyword'],
            [/[{}[\]]/, '@brackets'],
            [/[,=]/, 'delimiter'],
        ],
        multiline: [
            [/[^"]+/, 'string'],
            [/"""/, 'string', '@pop'],
            [/"/, 'string'],
        ],
    },
});

monaco.editor.defineTheme('panel', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
        'editor.background': '#ffffff',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#334155',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.lineHighlightBorder': '#00000000',
        'editorGutter.background': '#ffffff',
        'editor.selectionBackground': '#1447e633',
        'editorCursor.foreground': '#1447e6',
        'scrollbarSlider.background': '#cbd5e155',
    },
});

export interface Language {
    id: string;
    name: string;
}

export const getLanguages = (): Language[] =>
    monaco.languages
        .getLanguages()
        .map((language) => ({ id: language.id, name: language.aliases?.[0] || language.id }))
        .sort((a, b) => a.name.localeCompare(b.name));

export const findLanguageByFilename = (filename: string): string => {
    const name = filename.split('/').pop() || filename;
    const lower = name.toLowerCase();
    const languages = monaco.languages.getLanguages();

    const byName = languages.find((l) => l.filenames?.some((f) => f.toLowerCase() === lower));
    if (byName) return byName.id;

    const dot = lower.lastIndexOf('.');
    if (dot > -1) {
        const ext = lower.substring(dot);
        const byExt = languages.find((l) => l.extensions?.some((e) => e.toLowerCase() === ext));
        if (byExt) return byExt.id;
    }

    return 'plaintext';
};

const EditorContainer = styled.div`
    min-height: 20rem;
    height: calc(100vh - 11.5rem);
    ${tw`relative overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md`};
`;

export interface Props {
    style?: React.CSSProperties;
    initialContent?: string;
    mode: string;
    filename?: string;
    onModeChanged: (mode: string) => void;
    fetchContent: (callback: () => Promise<string>) => void;
    onContentSaved: () => void;
    onContentChanged?: (content: string) => void;
}

export default ({
    style,
    initialContent,
    filename,
    mode,
    fetchContent,
    onContentSaved,
    onModeChanged,
    onContentChanged,
}: Props) => {
    const container = useRef<HTMLDivElement>(null);
    const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();

    // Keep the latest callbacks around so that the editor commands never close over stale ones.
    const saved = useRef(onContentSaved);
    const changed = useRef(onContentChanged);
    saved.current = onContentSaved;
    changed.current = onContentChanged;

    useEffect(() => {
        if (!container.current) return;

        const instance = monaco.editor.create(container.current, {
            value: '',
            language: 'plaintext',
            theme: 'panel',
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 22,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            folding: true,
            bracketPairColorization: { enabled: true },
        });

        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saved.current());
        const subscription = instance.onDidChangeModelContent(() => changed.current?.(instance.getValue()));
        setEditor(instance);

        return () => {
            subscription.dispose();
            instance.getModel()?.dispose();
            instance.dispose();
        };
    }, []);

    useEffect(() => {
        if (filename === undefined) {
            return;
        }

        onModeChanged(findLanguageByFilename(filename));
    }, [filename]);

    useEffect(() => {
        const model = editor?.getModel();
        if (model) {
            monaco.editor.setModelLanguage(model, mode || 'plaintext');
        }
    }, [editor, mode]);

    useEffect(() => {
        if (editor) {
            editor.setValue(initialContent || '');
            // Drop the undo history so that "Ctrl+Z" doesn't delete the initial content we just set.
            editor.getModel()?.pushStackElement();
        }
    }, [editor, initialContent]);

    useEffect(() => {
        if (!editor) {
            fetchContent(() => Promise.reject(new Error('no editor session has been configured')));
            return;
        }

        fetchContent(() => Promise.resolve(editor.getValue()));
    }, [editor, fetchContent]);

    return <EditorContainer style={style} ref={container} />;
};
