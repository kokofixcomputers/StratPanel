import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getFileContents from '@/api/server/files/getFileContents';
import { httpErrorToHuman } from '@/api/http';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import saveFileContents from '@/api/server/files/saveFileContents';
import FileManagerBreadcrumbs from '@/components/server/files/FileManagerBreadcrumbs';
import { useHistory, useLocation, useParams } from 'react-router';
import FileNameModal from '@/components/server/files/FileNameModal';
import Can from '@/components/elements/Can';
import FlashMessageRender from '@/components/FlashMessageRender';
import { ServerError } from '@/components/elements/ScreenBlock';
import tw from 'twin.macro';
import ShareLogButton from '@/components/server/ShareLogButton';
import Button from '@/components/elements/Button';
import Select from '@/components/elements/Select';
import useFlash from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { encodePathSegments, hashToPath } from '@/helpers';
import { basename, dirname } from 'pathe';
import MonacoEditor, { getLanguages } from '@/components/elements/MonacoEditor';
import FileTooLarge from '@/components/server/files/FileTooLarge';
import loadDirectory from '@/api/server/files/loadDirectory';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { canEdit, isTooLargeError, MAX_EDIT_BYTES } from '@/lib/fileLimits';

const PRETTIFY_KEY = 'pterodactyl:editor:prettify-json';

/** Returns the formatted json, or null when the text is not strict json (comments, trailing commas, empty). */
const prettifyJson = (text: string): string | null => {
    if (!text.trim()) return null;

    try {
        return JSON.stringify(JSON.parse(text), null, 2) + '\n';
    } catch {
        return null;
    }
};

const getNewFileDraftKey = (uuid: string, directory: string) => `pterodactyl:new-file:${uuid}:${directory}`;

export default () => {
    const [error, setError] = useState('');
    // Set for a file that is not opened because it is too big, the size is null when it is not known.
    const [tooLarge, setTooLarge] = useState<{ size: number | null } | null>(null);
    const [downloading, setDownloading] = useState(false);
    const { action } = useParams<{ action: 'new' | string }>();
    const [loading, setLoading] = useState(action === 'edit');
    const [content, setContent] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [mode, setMode] = useState('plaintext');
    const [prettify, setPrettify] = useState(() => localStorage.getItem(PRETTIFY_KEY) === '1');
    const languages = useMemo(() => getLanguages(), []);

    const history = useHistory();
    const { hash } = useLocation();

    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const setDirectory = ServerContext.useStoreActions((actions) => actions.files.setDirectory);
    const { addError, addFlash, clearFlashes } = useFlash();

    const filePath = hashToPath(hash);
    const directory = action === 'new' ? filePath : dirname(filePath);
    const draftKey = action === 'new' ? getNewFileDraftKey(uuid, directory) : undefined;
    const saveDraft = useCallback(
        (value: string) => {
            if (!draftKey) return;

            if (value.length > 0) {
                sessionStorage.setItem(draftKey, value);
            } else {
                sessionStorage.removeItem(draftKey);
            }
        },
        [draftKey]
    );

    let fetchFileContent: null | (() => Promise<string>) = null;

    useEffect(() => {
        setDirectory(directory);
    }, [directory, setDirectory]);

    useEffect(() => {
        if (!draftKey) return;

        setContent(sessionStorage.getItem(draftKey) || '');
    }, [draftKey]);

    useEffect(() => {
        if (action === 'new') return;

        let cancelled = false;
        setError('');
        setTooLarge(null);
        setContent('');
        setLoading(true);

        // The size is in the list of the folder. A file over the limit is not downloaded at all, the browser would only be
        // slowed down by text it can not edit.
        loadDirectory(uuid, dirname(filePath))
            .then((files) => files.find((file) => file.isFile && file.name === basename(filePath)))
            .catch(() => undefined)
            .then((file) => {
                if (cancelled) return;
                if (file && !canEdit(file.size)) {
                    setTooLarge({ size: file.size });

                    return;
                }

                return getFileContents(uuid, filePath).then((text) => {
                    if (cancelled) return;
                    // The size was not known, or the file grew since the list was made.
                    if (new Blob([text]).size > MAX_EDIT_BYTES) setTooLarge({ size: null });
                    else setContent(text);
                });
            })
            .catch((error) => {
                if (cancelled) return;
                if (isTooLargeError(error)) return setTooLarge({ size: null });
                console.error(error);
                setError(httpErrorToHuman(error));
            })
            .then(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
    }, [action, uuid, filePath]);

    const download = () => {
        setDownloading(true);
        getFileDownloadUrl(uuid, filePath)
            .then((url) => {
                window.location.href = url;
            })
            .catch((error) => addError({ message: httpErrorToHuman(error), key: 'files:view' }))
            .then(() => setDownloading(false));
    };

    const save = async (name?: string): Promise<boolean> => {
        if (!fetchFileContent) {
            return false;
        }

        setLoading(true);
        clearFlashes('files:view');

        let redirecting = false;
        let saved = false;

        try {
            let content = await fetchFileContent();

            if (prettify && mode === 'json') {
                const pretty = prettifyJson(content);
                if (pretty !== null && pretty !== content) {
                    content = pretty;
                    setContent(pretty);
                }
            }

            await saveFileContents(uuid, name || filePath, content);
            saved = true;

            if (name) {
                if (draftKey) {
                    sessionStorage.removeItem(draftKey);
                }

                history.push(`/server/${id}/files/edit#/${encodePathSegments(name)}`);
                redirecting = true;
                return true;
            }
        } catch (error) {
            console.error(error);
            addError({ message: httpErrorToHuman(error), key: 'files:view' });
        } finally {
            if (!redirecting) {
                setLoading(false);
            }
        }

        return saved;
    };

    const saveAndRestart = async () => {
        if (!(await save())) return;

        instance?.send('set state', 'restart');
        addFlash({ key: 'files:view', type: 'success', message: 'File saved. The server is restarting.' });
    };

    const togglePrettify = async (checked: boolean) => {
        setPrettify(checked);
        localStorage.setItem(PRETTIFY_KEY, checked ? '1' : '0');
        if (!checked || !fetchFileContent) return;

        // Format what is in the editor right now, saving does it from then on.
        const pretty = prettifyJson(await fetchFileContent());
        if (pretty !== null) setContent(pretty);
    };

    const isBinary = useMemo(() => content.indexOf('\u0000') >= 0, [content]);

    // After every hook, a hook that is skipped on one render and not on the next breaks React.
    if (tooLarge) {
        return (
            <>
                <div className={'px-4 pt-4 lg:px-0'}>
                    <FlashMessageRender byKey={'files:view'} css={tw`mb-3`} />
                </div>
                <FileTooLarge
                    name={filePath}
                    size={tooLarge.size}
                    limit={MAX_EDIT_BYTES}
                    downloading={downloading}
                    onDownload={download}
                    onBack={() => history.push(`/server/${id}/files#${encodePathSegments(directory)}`)}
                />
            </>
        );
    }

    if (error) {
        return <ServerError message={error} onBack={() => history.goBack()} />;
    }

    const buttons = (
        <div css={tw`flex flex-wrap items-center justify-end gap-2`}>
            {mode === 'json' && (
                <label css={tw`flex items-center text-sm text-neutral-200 cursor-pointer mr-2`}>
                    <input
                        type={'checkbox'}
                        css={tw`mr-2`}
                        checked={prettify}
                        onChange={(e) => togglePrettify(e.currentTarget.checked)}
                    />
                    Prettify JSON
                </label>
            )}
            <div css={tw`w-40`}>
                <Select value={mode} onChange={(e) => setMode(e.currentTarget.value)}>
                    {languages.map((language) => (
                        <option key={language.id} value={language.id}>
                            {language.name}
                        </option>
                    ))}
                </Select>
            </div>
            {action === 'edit' && /(\.log|crash-reports\/[^/]+\.txt)$/.test(filePath) && (
                <ShareLogButton file={filePath} />
            )}
            {action === 'edit' ? (
                <Can action={'file.update'}>
                    <Can action={'control.restart'}>
                        <Button isSecondary disabled={!instance} onClick={() => saveAndRestart()}>
                            Save &amp; Restart
                        </Button>
                    </Can>
                    <Button onClick={() => save()}>Save Content</Button>
                </Can>
            ) : (
                <Can action={'file.create'}>
                    <Button onClick={() => setModalVisible(true)}>Create File</Button>
                </Can>
            )}
        </div>
    );

    return (
        <>
            <div className={'px-4 pt-4 lg:px-0'}>
                <FlashMessageRender byKey={'files:view'} css={tw`mb-3`} />
                <div css={tw`flex flex-wrap items-center justify-between gap-3 mb-3`}>
                    <ErrorBoundary>
                        <div css={tw`min-w-0`}>
                            <FileManagerBreadcrumbs withinFileEditor isNewFile={action !== 'edit'} />
                        </div>
                    </ErrorBoundary>
                    {buttons}
                </div>
                {hash.replace(/^#/, '').endsWith('.pteroignore') && (
                    <div css={tw`mb-3 p-3 border bg-primary-50 rounded-xl border-primary-200`}>
                        <p css={tw`text-primary-800 text-sm`}>
                            You&apos;re editing a{' '}
                            <code css={tw`font-mono bg-white rounded py-px px-1`}>.pteroignore</code> file. Anything
                            listed in here is excluded from backups. Wildcards are supported with an asterisk, and you
                            can negate a rule by prepending an exclamation point.
                        </p>
                    </div>
                )}
                {isBinary && (
                    <div css={tw`mb-3 p-3 border bg-yellow-50 rounded-xl border-yellow-200`}>
                        <p css={tw`text-yellow-800 text-sm`}>
                            This looks like a binary file. Saving it from the editor will probably corrupt it.
                        </p>
                    </div>
                )}
            </div>
            <FileNameModal
                visible={modalVisible}
                onDismissed={() => setModalVisible(false)}
                onFileNamed={(name) => {
                    setModalVisible(false);
                    save(name);
                }}
            />
            <div css={tw`relative px-4 lg:px-0 pb-4`}>
                <SpinnerOverlay visible={loading} />
                <MonacoEditor
                    mode={mode}
                    filename={hash.replace(/^#/, '')}
                    onModeChanged={setMode}
                    initialContent={content}
                    fetchContent={(value) => {
                        fetchFileContent = value;
                    }}
                    onContentSaved={() => {
                        if (action !== 'edit') {
                            setModalVisible(true);
                        } else {
                            save();
                        }
                    }}
                    onContentChanged={action === 'new' ? saveDraft : undefined}
                />
            </div>
        </>
    );
};
