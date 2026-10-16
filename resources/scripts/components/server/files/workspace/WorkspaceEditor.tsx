import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
// The editor of the file manager is set up once, in this module: the theme, the syntax highlighters, the workers.
import '@/components/elements/MonacoEditor';

/** A file that is open: its text (and the history of changes to it, and where the cursor and scroll were) live in a model. */
export interface Doc {
    model: monaco.editor.ITextModel;
    viewState: monaco.editor.ICodeEditorViewState | null;
    // The version of the text that is on the server, the file has changes when the model is at another version.
    savedVersion: number;
    listener: monaco.IDisposable;
}

interface Props {
    docs: React.MutableRefObject<Map<string, Doc>>;
    // The file that is shown, null for none.
    path: string | null;
    // Changes when a model was made for a file that is being opened, so the editor looks again.
    revision: number;
    readOnly: boolean;
    onSave: () => void;
    onCursor: (line: number, column: number) => void;
    visible: boolean;
}

/**
 * One Monaco editor for all the tabs. Each file is a model: switching tabs gives the editor another model, so every file keeps its own
 * undo history, cursor, scroll position and folded blocks, like the tabs of VS Code.
 */
export default ({ docs, path, revision, readOnly, onSave, onCursor, visible }: Props) => {
    const container = useRef<HTMLDivElement>(null);
    const editor = useRef<monaco.editor.IStandaloneCodeEditor>();
    const shown = useRef<string | null>(null);
    // The newest callbacks, the commands of the editor are made once.
    const save = useRef(onSave);
    const cursor = useRef(onCursor);
    save.current = onSave;
    cursor.current = onCursor;

    useEffect(() => {
        if (!container.current) return;

        const instance = monaco.editor.create(container.current, {
            model: null,
            theme: 'panel',
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 22,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            folding: true,
            bracketPairColorization: { enabled: true },
        });
        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save.current());
        const subscription = instance.onDidChangeCursorPosition((e) =>
            cursor.current(e.position.lineNumber, e.position.column)
        );
        editor.current = instance;

        return () => {
            subscription.dispose();
            // The models belong to the workspace, they are disposed with their tabs.
            instance.setModel(null);
            instance.dispose();
            editor.current = undefined;
            shown.current = null;
        };
    }, []);

    useEffect(() => {
        editor.current?.updateOptions({ readOnly });
    }, [readOnly]);

    useEffect(() => {
        const instance = editor.current;
        if (!instance) return;

        // Where the cursor and the scroll are is kept for when the tab is chosen again.
        if (shown.current && shown.current !== path) {
            const previous = docs.current.get(shown.current);
            if (previous) previous.viewState = instance.saveViewState();
        }

        const doc = path ? docs.current.get(path) : undefined;
        if (doc && (instance.getModel() !== doc.model || shown.current !== path)) {
            instance.setModel(doc.model);
            if (doc.viewState) instance.restoreViewState(doc.viewState);
            if (visible) instance.focus();
        } else if (!doc) {
            instance.setModel(null);
        }
        shown.current = doc ? path : null;
    }, [path, revision, visible]);

    return <div ref={container} className={`min-h-0 flex-1 ${visible ? '' : 'hidden'}`} />;
};
