import React, { useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import classNames from 'classnames';
import {
    ArrowCircleUpIcon,
    ArrowLeftIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClockIcon,
    DownloadIcon,
    ExternalLinkIcon,
    HeartIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { getProjectVersions, loadersFor, ModrinthVersion, versionRange } from '@/lib/minecraft';
import { ContentKind } from '@/components/server/content/useContentQuery';
import { CategoryTag, Member, prettyTag, ProjectDetails, toProject } from '@/lib/modrinth';
import { getProjectDetails, getProjectMembers, loadTags, sourceLabel } from '@/lib/contentSource';
import { cfNumber, getChangelog, isCurseForgeId } from '@/lib/curseforge';
import { readQuery } from '@/components/server/content/useContentQuery';
import Gallery from '@/components/server/content/Gallery';
import Markdown from '@/components/server/content/Markdown';
import ProjectIcon from '@/components/server/content/ProjectIcon';
import TagIcon from '@/components/server/content/TagIcon';
import useContentActions from '@/components/server/content/useContentActions';
import { compact, timeAgo } from '@/components/server/content/format';

const INSTALLABLE: string[] = ['mod', 'plugin', 'datapack', 'resourcepack', 'modpack', 'world'];

type Tab = 'description' | 'gallery' | 'versions';

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
        <h2 className={'mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>{title}</h2>
        {children}
    </section>
);

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className={'flex items-start justify-between gap-4 py-1.5 text-sm'}>
        <dt className={'flex-shrink-0 text-neutral-300'}>{label}</dt>
        <dd className={'m-0 min-w-0 break-words text-right text-neutral-50'}>{children}</dd>
    </div>
);

const TypePill = ({ type }: { type?: string }) => (
    <span
        className={classNames(
            'ml-2 rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide',
            type === 'beta'
                ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                : type === 'alpha'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
        )}
    >
        {type || 'release'}
    </span>
);

/** The versions of a project, newest first, each with a button to install exactly that one. */
const Versions = ({
    project,
    kind,
    installLabel,
    disabled,
    onInstall,
}: {
    project: ProjectDetails;
    kind: ContentKind;
    installLabel: string;
    disabled: boolean;
    onInstall: (versionId: string) => void;
}) => {
    const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    // CurseForge keeps the changelog of every file apart, it is asked for when it is opened.
    const [logs, setLogs] = useState<Record<string, string>>({});
    const curseForge = isCurseForgeId(project.id);

    const toggleChangelog = (version: ModrinthVersion) => {
        const opening = open !== version.id;
        setOpen(opening ? version.id : null);
        if (opening && curseForge && logs[version.id] === undefined) {
            getChangelog(project.id, version.id)
                .then((html) => setLogs((current) => ({ ...current, [version.id]: html })))
                .catch(() => setLogs((current) => ({ ...current, [version.id]: '' })));
        }
    };

    useEffect(() => {
        let cancelled = false;
        // Files that can only be downloaded from CurseForge stay in the list, with a link instead of a button to install.
        getProjectVersions(project.id)
            .then((list) => !cancelled && setVersions(list.filter((v) => v.files.length > 0 || v.restricted)))
            .catch((e) => !cancelled && setError(e.message));

        return () => {
            cancelled = true;
        };
    }, [project.id]);

    if (error) return <p className={'text-sm text-red-600'}>{error}</p>;
    if (!versions) return <Spinner centered size={'base'} />;
    if (!versions.length) return <p className={'text-sm text-neutral-300'}>This project has no versions to install.</p>;

    return (
        <ul className={'space-y-2'}>
            {versions.map((v) => (
                <li key={v.id} className={'rounded-xl border border-neutral-500 bg-white shadow-sm'}>
                    <div className={'flex flex-wrap items-center gap-3 p-3'}>
                        <div className={'min-w-0 flex-1 basis-64'}>
                            <p className={'flex flex-wrap items-center text-sm font-semibold text-neutral-50'}>
                                {v.version_number}
                                <TypePill type={v.version_type} />
                            </p>
                            <p className={'mt-0.5 text-xs text-neutral-400'}>
                                Minecraft {versionRange(v.game_versions)} &middot; {v.loaders.map(prettyTag).join(', ')}{' '}
                                &middot; {timeAgo(v.date_published)}
                                {v.downloads !== undefined && <> &middot; {compact(v.downloads)} downloads</>}
                            </p>
                        </div>
                        {((v.changelog && v.changelog.trim()) || curseForge) && (
                            <button
                                type={'button'}
                                onClick={() => toggleChangelog(v)}
                                className={'inline-flex items-center text-xs text-neutral-300 hover:text-neutral-50'}
                            >
                                {open === v.id ? (
                                    <ChevronUpIcon className={'mr-1 h-4 w-4'} />
                                ) : (
                                    <ChevronDownIcon className={'mr-1 h-4 w-4'} />
                                )}
                                Changelog
                            </button>
                        )}
                        {kind !== 'modpack' &&
                            (v.restricted ? (
                                <a
                                    href={
                                        curseForge
                                            ? `${project.website_url || 'https://www.curseforge.com'}/files/${cfNumber(
                                                  v.id
                                              )}`
                                            : v.external_url || project.website_url || '#'
                                    }
                                    target={'_blank'}
                                    rel={'noopener noreferrer nofollow'}
                                    className={
                                        'inline-flex items-center rounded-lg border border-neutral-500 px-3 py-1.5 text-xs font-medium text-primary-600 no-underline hover:bg-neutral-600'
                                    }
                                    title={
                                        curseForge
                                            ? 'The author only lets this file be downloaded from CurseForge.'
                                            : 'The author hosts this file elsewhere.'
                                    }
                                >
                                    <ExternalLinkIcon className={'mr-1.5 h-4 w-4'} />
                                    {curseForge ? 'On CurseForge' : 'Download page'}
                                </a>
                            ) : (
                                <Button size={Button.Sizes.Small} disabled={disabled} onClick={() => onInstall(v.id)}>
                                    <DownloadIcon className={'mr-1.5 -ml-1 h-4 w-4'} />
                                    {installLabel}
                                </Button>
                            ))}
                    </div>
                    {open === v.id && (v.changelog || logs[v.id]) && (
                        <div className={'border-t border-neutral-500 p-4'}>
                            <Markdown source={v.changelog || logs[v.id]} html={!v.changelog} />
                        </div>
                    )}
                    {open === v.id && curseForge && logs[v.id] === undefined && (
                        <div className={'border-t border-neutral-500 p-4'}>
                            <Spinner centered size={'small'} />
                        </div>
                    )}
                    {open === v.id && curseForge && logs[v.id] === '' && !v.changelog && (
                        <p className={'border-t border-neutral-500 p-4 text-sm text-neutral-300'}>
                            This file has no changelog.
                        </p>
                    )}
                </li>
            ))}
        </ul>
    );
};

/** A project of Modrinth or CurseForge on its own page: the long description, the pictures, the versions and a button to install it. */
export default () => {
    const { project: slug } = useParams<{ project: string }>();
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const location = useLocation<{ fromList?: boolean } | undefined>();
    const history = useHistory();
    // The address says which site the project is on, see useContentQuery.
    const source = readQuery(location.search, '').source;

    const actions = useContentActions();
    const { managed, resourcePack, busy } = actions;

    const [project, setProject] = useState<ProjectDetails | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [tags, setTags] = useState<CategoryTag[]>([]);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('description');

    useEffect(() => {
        setProject(null);
        setError('');
        setTab('description');
        window.scrollTo({ top: 0 });

        let cancelled = false;
        setMembers([]);
        setTags([]);
        getProjectDetails(source, slug)
            .then((details) => !cancelled && setProject(details))
            .catch((e) => !cancelled && setError(e.message));
        getProjectMembers(source, slug)
            .then((list) => !cancelled && setMembers(list))
            .catch(() => undefined);
        loadTags(source)
            .then(({ categories }) => !cancelled && setTags(categories))
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [slug, source]);

    // Back to the results as they were, with the same filters and page.
    const listUrl = { pathname: `/server/${id}/mods`, search: location.search };
    const back = () => (location.state?.fromList ? history.goBack() : history.push(listUrl));

    const BackButton = (
        <button
            type={'button'}
            onClick={back}
            className={
                'mb-4 inline-flex items-center rounded-lg border border-neutral-500 bg-white px-3 py-2 text-sm font-medium text-neutral-300 shadow-sm hover:bg-neutral-600'
            }
        >
            <ArrowLeftIcon className={'mr-2 h-4 w-4'} />
            Back to results
        </button>
    );

    if (error) {
        return (
            <ServerContentBlock title={'Content'}>
                {BackButton}
                <p className={'text-sm text-red-600'}>{error}</p>
            </ServerContentBlock>
        );
    }
    if (!project) {
        return (
            <ServerContentBlock title={'Content'}>
                {BackButton}
                <Spinner size={'large'} centered />
            </ServerContentBlock>
        );
    }

    const kind = INSTALLABLE.includes(project.project_type) ? (project.project_type as ContentKind) : null;
    // CurseForge authors can keep their files off other sites, then there is only a link to CurseForge.
    const blocked = project.distribution_allowed === false;
    const owner = members.find((m) => m.role === 'Owner') || members[0];
    const record = managed.mods[project.id];
    const upgrade = managed.updates[project.id];
    const inUse = kind === 'resourcepack' && resourcePack.pack?.info?.projectId === project.id;
    const pending = busy === project.id;
    // Only the categories of this kind of project, a name can mean something else for another kind.
    const ownTags = tags.filter((tag) => tag.project_type === project.project_type);
    const icons = Object.fromEntries(ownTags.map((tag) => [tag.name, tag.icon]));
    const labels = Object.fromEntries(ownTags.filter((tag) => tag.label).map((tag) => [tag.name, tag.label!]));
    const installLabel = kind === 'resourcepack' ? 'Use pack' : kind === 'world' ? 'Install world' : 'Install';
    const install = (versionId?: string) => {
        if (!kind) return;
        const asProject = toProject(project, owner?.user.username || '');

        return kind === 'world' ? actions.installWorld(asProject) : actions.install(asProject, kind, versionId);
    };
    const tabs: { id: Tab; label: string }[] = [
        { id: 'description', label: 'Description' },
        { id: 'gallery', label: `Gallery${project.gallery.length ? ` (${project.gallery.length})` : ''}` },
        { id: 'versions', label: 'Versions' },
    ];
    const shownCategories = [...project.categories, ...(project.additional_categories || [])].filter(
        (c) => !loadersFor((kind === 'world' ? 'mod' : kind) || 'mod').includes(c)
    );
    const links = [
        { label: 'Source code', url: project.source_url },
        { label: 'Report issues', url: project.issues_url },
        { label: 'Wiki', url: project.wiki_url },
        { label: 'Discord', url: project.discord_url },
    ].filter((link): link is { label: string; url: string } => !!link.url);

    return (
        <ServerContentBlock title={project.title}>
            {BackButton}
            <FlashMessageRender byKey={'mods'} className={'mb-4'} />

            <header
                className={
                    'mb-4 flex flex-wrap items-start gap-5 rounded-xl border border-neutral-500 bg-white p-5 shadow-md'
                }
            >
                <ProjectIcon src={project.icon_url} size={96} />
                <div className={'min-w-0 flex-1 basis-72'}>
                    <h1 className={'text-2xl font-bold leading-tight text-neutral-50'}>{project.title}</h1>
                    {owner && <p className={'mt-0.5 text-xs text-neutral-400'}>by {owner.user.username}</p>}
                    <p className={'mt-2 text-sm text-neutral-300'}>{project.description}</p>
                    {shownCategories.length > 0 && (
                        <div className={'mt-3 flex flex-wrap gap-1.5'}>
                            {shownCategories.slice(0, 8).map((category) => (
                                <span
                                    key={category}
                                    className={
                                        'inline-flex items-center gap-1 rounded-full bg-neutral-600 px-2.5 py-1 text-xs font-medium text-neutral-300'
                                    }
                                >
                                    <TagIcon svg={icons[category]} size={14} />
                                    {labels[category] || prettyTag(category)}
                                </span>
                            ))}
                        </div>
                    )}
                    <div className={'mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400'}>
                        <span className={'inline-flex items-center'}>
                            <DownloadIcon className={'mr-1 h-4 w-4'} />
                            {compact(project.downloads)} downloads
                        </span>
                        <span className={'inline-flex items-center'}>
                            <HeartIcon className={'mr-1 h-4 w-4'} />
                            {compact(project.followers)} follows
                        </span>
                        <span className={'inline-flex items-center'}>
                            <ClockIcon className={'mr-1 h-4 w-4'} />
                            Updated {timeAgo(project.updated)}
                        </span>
                    </div>
                </div>
                <div className={'flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end'}>
                    {!kind ? (
                        <p className={'max-w-[14rem] text-right text-xs text-neutral-400'}>
                            This kind of project can not be installed on a server.
                        </p>
                    ) : inUse ? (
                        <span className={'inline-flex items-center text-sm font-medium text-green-700'}>
                            <CheckIcon className={'mr-1 h-5 w-5'} />
                            In use on this server
                        </span>
                    ) : record ? (
                        <>
                            <span className={'text-right text-xs text-neutral-300'}>
                                Installed {record.versionNumber}
                                {record.dependencyOf && ' as a dependency'}
                            </span>
                            <div className={'flex flex-wrap justify-end gap-2'}>
                                {upgrade && (
                                    <Button disabled={!!busy} onClick={() => actions.update(record)}>
                                        <ArrowCircleUpIcon className={'mr-1.5 -ml-1 h-5 w-5'} />
                                        {pending ? 'Updating...' : `Update to ${upgrade.versionNumber}`}
                                    </Button>
                                )}
                                <Button.Danger
                                    variant={Button.Variants.Secondary}
                                    disabled={!!busy}
                                    onClick={() => actions.askUninstall(record)}
                                >
                                    <TrashIcon className={'mr-1.5 -ml-1 h-5 w-5'} />
                                    Uninstall
                                </Button.Danger>
                            </div>
                        </>
                    ) : blocked ? (
                        <>
                            <p className={'max-w-[16rem] text-right text-xs text-neutral-400'}>
                                The author only lets this be downloaded from CurseForge.
                            </p>
                            {project.website_url && (
                                <a
                                    href={project.website_url}
                                    target={'_blank'}
                                    rel={'noopener noreferrer nofollow'}
                                    className={
                                        'inline-flex items-center justify-center rounded-lg border border-neutral-500 px-4 py-2 text-sm font-medium text-primary-600 no-underline hover:bg-neutral-600'
                                    }
                                >
                                    <ExternalLinkIcon className={'mr-2 h-4 w-4'} />
                                    Open on CurseForge
                                </a>
                            )}
                        </>
                    ) : (
                        <Button size={Button.Sizes.Large} disabled={!!busy} onClick={() => install()}>
                            <DownloadIcon className={'mr-2 -ml-1 h-5 w-5'} />
                            {pending ? 'Installing...' : installLabel}
                        </Button>
                    )}
                </div>
            </header>

            <div className={'grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]'}>
                <div className={'min-w-0'}>
                    <div className={'mb-4 inline-flex flex-wrap rounded-xl bg-neutral-600 p-1'}>
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type={'button'}
                                aria-pressed={tab === t.id}
                                onClick={() => setTab(t.id)}
                                className={classNames(
                                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150',
                                    {
                                        'bg-primary-600 text-snow shadow': tab === t.id,
                                        'text-neutral-300 hover:text-neutral-50': tab !== t.id,
                                    }
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {tab === 'description' && (
                        <div className={'rounded-xl border border-neutral-500 bg-white p-5 shadow-md'}>
                            {project.body.trim() ? (
                                <Markdown source={project.body} html={project.source === 'curseforge'} />
                            ) : (
                                <p className={'text-sm text-neutral-300'}>{project.description}</p>
                            )}
                        </div>
                    )}
                    {tab === 'gallery' && <Gallery images={project.gallery} />}
                    {tab === 'versions' && (
                        <Versions
                            project={project}
                            kind={kind || 'mod'}
                            installLabel={installLabel}
                            disabled={!!busy || !kind || blocked}
                            onInstall={(versionId) => install(versionId)}
                        />
                    )}
                </div>

                <aside className={'space-y-4'}>
                    <Box title={'Compatibility'}>
                        <dl className={'m-0'}>
                            <Fact label={'Minecraft'}>{versionRange(project.game_versions)}</Fact>
                            {project.loaders.length > 0 && (
                                <Fact label={kind === 'plugin' ? 'Platforms' : 'Loaders'}>
                                    {project.loaders.map(prettyTag).join(', ')}
                                </Fact>
                            )}
                            {project.source !== 'curseforge' && (kind === 'mod' || kind === 'modpack') && (
                                <>
                                    <Fact label={'On servers'}>{prettyTag(project.server_side)}</Fact>
                                    <Fact label={'On clients'}>{prettyTag(project.client_side)}</Fact>
                                </>
                            )}
                        </dl>
                    </Box>
                    {links.length > 0 && (
                        <Box title={'Links'}>
                            <ul className={'m-0 list-none space-y-1.5 p-0'}>
                                {links.map((link) => (
                                    <li key={link.label}>
                                        <a
                                            href={link.url}
                                            target={'_blank'}
                                            rel={'noopener noreferrer nofollow'}
                                            className={
                                                'inline-flex items-center text-sm text-primary-600 no-underline hover:underline'
                                            }
                                        >
                                            <ExternalLinkIcon className={'mr-1.5 h-4 w-4'} />
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </Box>
                    )}
                    <Box title={'Details'}>
                        <dl className={'m-0'}>
                            {project.license && <Fact label={'License'}>{project.license.name}</Fact>}
                            <Fact label={'Published'}>{new Date(project.published).toLocaleDateString()}</Fact>
                            <Fact label={'Updated'}>{new Date(project.updated).toLocaleDateString()}</Fact>
                        </dl>
                    </Box>
                    {members.length > 0 && (
                        <Box title={'Creators'}>
                            <ul className={'m-0 list-none space-y-2 p-0'}>
                                {members.map((m) => (
                                    <li key={m.user.username} className={'flex items-center gap-2.5'}>
                                        {m.user.avatar_url ? (
                                            <img
                                                src={m.user.avatar_url}
                                                alt={''}
                                                referrerPolicy={'no-referrer'}
                                                className={'h-8 w-8 rounded-full bg-neutral-600'}
                                            />
                                        ) : (
                                            <span className={'h-8 w-8 rounded-full bg-neutral-600'} />
                                        )}
                                        <span className={'min-w-0'}>
                                            <span className={'block truncate text-sm font-medium text-neutral-50'}>
                                                {m.user.username}
                                            </span>
                                            <span className={'block text-xs text-neutral-400'}>{m.role}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Box>
                    )}
                    <p className={'px-1 text-xs text-neutral-400'}>
                        The information comes from {sourceLabel(project.source ?? 'modrinth')}.
                    </p>
                </aside>
            </div>

            {actions.dialogs}
        </ServerContentBlock>
    );
};
