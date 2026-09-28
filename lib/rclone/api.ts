import * as Sentry from '@sentry/browser'
import { message } from '@tauri-apps/plugin-dialog'
import { platform } from '@tauri-apps/plugin-os'
import pRetry from 'p-retry'
import { useHostStore } from '../../store/host'
import { useStore } from '../../store/memory'
import type { JobItem } from '../../types/jobs'
import type { FlagValue } from '../../types/rclone'
import { getFsInfo } from '../format'
import { restartActiveRclone, runRcloneCli } from './cli'
import rclone, { fetchJobStatus } from './client'
import { parseRcloneOptions } from './common'

const RE_BACKSLASH = /\\/g
const RE_PATH_SEPARATOR = /[/\\]/
const RE_WINDOWS_EXTENDED_PATH = /(\/\/\?\/|\\\\\?\\)/
const RE_WINDOWS_DRIVE_ROOT = /^:local:[a-zA-Z]:\/$/
const RE_WINDOWS_DRIVE_LETTER = /^[a-zA-Z]:$/

export async function startDryRun<T>(operation: () => Promise<T>): Promise<T> {
    await rclone('/options/set', {
        // @ts-ignore
        body: {
            main: { DryRun: true },
        },
    })
    try {
        const result = await operation()
        if (typeof result === 'number') {
            useStore.setState((state) => ({
                dryRunJobIds: [...state.dryRunJobIds, result],
            }))
        }
        return result
    } finally {
        await rclone('/options/set', {
            // @ts-ignore
            body: {
                main: { DryRun: false },
            },
        })
    }
}

function serializeOptions(
    remotePath: string,
    options: {
        remote?: Record<string, FlagValue>
        global?: Record<string, FlagValue>
    }
) {
    console.log('[serializeRemoteOptions] ', remotePath)

    const { remoteName, filePath, dirPath, type, root } = getFsInfo(remotePath)

    console.log('[serializeRemoteOptions] ', remotePath, 'remoteName', remoteName)
    console.log('[serializeRemoteOptions] ', remotePath, 'filePath', filePath)
    console.log('[serializeRemoteOptions] ', remotePath, 'dirPath', dirPath)
    console.log('[serializeRemoteOptions] ', remotePath, 'type', type)
    console.log('[serializeRemoteOptions] ', remotePath, 'root', root)

    let serialized = `${remoteName}`

    if (
        Object.keys(options.remote || {}).length > 0 ||
        Object.keys(options.global || {}).length > 0
    ) {
        serialized += ','
    }

    if (options.remote && Object.keys(options.remote).length > 0) {
        serialized += Object.entries(options.remote)
            .map(([key, value]) => `${key}="${value}"`)
            .join(',')
    }

    if (options.global && Object.keys(options.global).length > 0) {
        serialized += Object.entries(options.global)
            .map(([key, value]) => `global.${key}="${value}"`)
            .join(',')
    }

    serialized += ':'

    if (remoteName === ':local') {
        if (RE_WINDOWS_DRIVE_ROOT.test(root)) {
            const driveLetter = root.slice(7)
            console.log(
                '[serializeRemoteOptions] ',
                remotePath,
                'adding Windows drive',
                driveLetter
            )
            serialized += driveLetter
        } else {
            console.log('[serializeRemoteOptions] ', remotePath, 'adding / for Unix local')
            serialized += '/'
        }
    }

    if (type === 'folder') {
        serialized += dirPath
    } else {
        serialized += filePath
    }

    console.log('[serializeRemoteOptions] ', remotePath, 'serialized', serialized)

    return serialized
}

async function hasStat(path: string) {
    try {
        const { root, filePath } = getFsInfo(path)
        const r = await rclone('/operations/stat', {
            params: {
                query: {
                    fs: root === ':local:' ? ':local:/' : root,
                    remote: filePath,
                },
            },
        })
        if (!r || !r.item) {
            return false
        }
        return true
    } catch {
        return false
    }
}

export async function startCopy({
    sources,
    destination,
    options,
}: {
    sources: string[]
    destination: string
    options: {
        copy?: Record<string, FlagValue>
        config?: Record<string, FlagValue>
        filter?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    console.log('[startCopy] starting', {
        sources,
        destination,
        optionKeys: Object.keys(options),
    })

    for (const source of sources) {
        const sourceExists = await hasStat(source)
        if (!sourceExists) {
            throw new Error(`Source does not exist, ${source} is missing`)
        }
    }

    if (
        sources.length > 1 &&
        options.filter &&
        ('include' in options.filter || 'include_from' in options.filter)
    ) {
        throw new Error('Include rules are not supported with multiple sources')
    }

    const mergedOptions = {
        ...(options.config || {}),
        ...(options.copy || {}),
        ...(options.filter || {}),
    }

    const pendingJobs: Parameters<typeof startBatch>[0] = []
    const handledSourcePaths: Record<string, true> = {}
    const folderSources = sources.filter((path) => path.endsWith('/') || path.endsWith('\\'))

    console.log('[Copy] ======DST INFO====== ', destination, ' ====================')
    const {
        root: dstRoot,
        dirPath: dstDirPath,
        fullDirPath: dstFullDirPath,
        remoteName: dstRemoteName,
    } = getFsInfo(destination)

    console.log('[Copy] ======DST INFO====== ', destination, ' ====================')

    const dstOptions =
        options.remotes && dstRemoteName && dstRemoteName in options.remotes
            ? (JSON.parse(options.remotes[dstRemoteName] as unknown as string) as any)
            : undefined

    for (const source of sources) {
        console.log('[Copy] ======START====== ', source, ' ====================')
        if (handledSourcePaths[source]) {
            console.log('[Copy] skipping because source is already handled', source)
            continue
        }

        handledSourcePaths[source] = true

        console.log('[Copy] ======SRC INFO====== ', source, ' ====================')

        const {
            root: srcRoot,
            filePath: srcFilePath,
            fullDirPath: srcFullDirPath,
            type: srcType,
            name: srcName,
            remoteName: srcRemoteName,
        } = getFsInfo(source)

        console.log('[Copy] ======SRC INFO====== ', source, ' ====================')

        const srcOptions =
            options.remotes && srcRemoteName && srcRemoteName in options.remotes
                ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
                : undefined

        if (srcType === 'folder') {
            const jobParams: Parameters<typeof startBatch>[0][number] = {
                _path: 'sync/copy',
                srcFs: serializeOptions(srcFullDirPath, {
                    remote: srcOptions,
                    global: mergedOptions,
                }),
                dstFs: serializeOptions(`${dstFullDirPath}${srcName}`, {
                    remote: dstOptions,
                }),
                createEmptySrcDirs: true,
            }

            pendingJobs.push(jobParams)
            continue
        }

        if (folderSources.some((folder) => source.startsWith(folder))) {
            console.log(
                '[Copy] skipping because source or parent folder is already handled',
                source
            )
            continue
        }

        console.log('[Copy] ', source, 'srcRoot', srcRoot, srcFilePath)
        console.log('[Copy] ', destination, 'dstRoot', dstRoot, dstDirPath)

        const jobParams: Parameters<typeof startBatch>[0][number] = {
            _path: 'operations/copyfile',
            srcFs: serializeOptions(srcRoot, {
                remote: srcOptions,
                global: mergedOptions,
            }),
            srcRemote: srcFilePath,
            dstFs: serializeOptions(dstRoot, {
                remote: dstOptions,
            }),
            dstRemote: `${dstDirPath === '/' ? '' : dstDirPath}${srcName}`,
        }

        pendingJobs.push(jobParams)
    }

    console.log('[startCopy] submitting batch', { jobCount: pendingJobs.length })
    return startBatch(pendingJobs)
}

export async function startMove({
    sources,
    destination,
    options,
}: {
    sources: string[]
    destination: string
    options: {
        move?: Record<string, FlagValue>
        config?: Record<string, FlagValue>
        filter?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    console.log('[startMove] starting', {
        sources,
        destination,
        optionKeys: Object.keys(options),
    })

    for (const source of sources) {
        const sourceExists = await hasStat(source)
        if (!sourceExists) {
            throw new Error(`Source does not exist, ${source} is missing`)
        }
    }

    if (
        sources.length > 1 &&
        options.filter &&
        ('include' in options.filter || 'include_from' in options.filter)
    ) {
        throw new Error('Include rules are not supported with multiple sources')
    }

    const mergedOptions = {
        ...(options.config || {}),
        ...(options.move || {}),
        ...(options.filter || {}),
    }

    const pendingJobs: Parameters<typeof startBatch>[0] = []
    const handledSourcePaths: Record<string, true> = {}
    const folderSources = sources.filter((path) => path.endsWith('/') || path.endsWith('\\'))

    const {
        root: dstRoot,
        dirPath: dstDirPath,
        fullDirPath: dstFullDirPath,
        remoteName: dstRemoteName,
    } = getFsInfo(destination)

    const dstOptions =
        options.remotes && dstRemoteName && dstRemoteName in options.remotes
            ? (JSON.parse(options.remotes[dstRemoteName] as unknown as string) as any)
            : undefined

    for (const source of sources) {
        if (handledSourcePaths[source]) {
            console.log('[Move] skipping because source is already handled', source)
            continue
        }

        handledSourcePaths[source] = true

        const {
            root: srcRoot,
            filePath: srcFilePath,
            fullDirPath: srcFullDirPath,
            type: srcType,
            name: srcName,
            remoteName: srcRemoteName,
        } = getFsInfo(source)

        const srcOptions =
            options.remotes && srcRemoteName && srcRemoteName in options.remotes
                ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
                : undefined

        if (srcType === 'folder') {
            const jobParams: Parameters<typeof startBatch>[0][number] = {
                _path: 'sync/move',
                srcFs: serializeOptions(srcFullDirPath, {
                    remote: srcOptions,
                    global: mergedOptions,
                }),
                dstFs: serializeOptions(`${dstFullDirPath}${srcName}`, {
                    remote: dstOptions,
                }),
                createEmptySrcDirs: true,
            }

            pendingJobs.push(jobParams)
            continue
        }

        if (folderSources.some((folder) => source.startsWith(folder))) {
            console.log(
                '[Move] skipping because source or parent folder is already handled',
                source
            )
            continue
        }

        const jobParams: Parameters<typeof startBatch>[0][number] = {
            _path: 'operations/movefile',
            srcFs: serializeOptions(srcRoot, {
                remote: srcOptions,
                global: mergedOptions,
            }),
            srcRemote: srcFilePath,
            dstFs: serializeOptions(dstRoot, {
                remote: dstOptions,
            }),
            dstRemote: `${dstDirPath === '/' ? '' : dstDirPath}${srcName}`,
        }

        pendingJobs.push(jobParams)
    }

    console.log('[startMove] submitting batch', { jobCount: pendingJobs.length })
    return startBatch(pendingJobs)
}

/* JOBS */
const RE_CONNECTION_STRING_PARAMS = /^([^,:]*),(?:[^":]|"[^"]*")*:/

/** `remote,opt="x":path` -> `remote:path`, and strips Windows extended-length prefixes. */
function readableFsPath(path: string) {
    const stripped = path.replace(RE_CONNECTION_STRING_PARAMS, '$1:')
    return platform() === 'windows' ? stripped.replace(RE_WINDOWS_EXTENDED_PATH, '') : stripped
}

function joinFsPath(fs: string, remote?: string) {
    if (!remote) {
        return fs
    }
    return fs.endsWith(':') || fs.endsWith('/') ? `${fs}${remote}` : `${fs}/${remote}`
}

function jobLabelFromInput(input: Record<string, any>) {
    const fs = input.srcFs ?? input.path1 ?? input.fs
    if (typeof fs !== 'string' || !fs) {
        return undefined
    }
    const remote = input.srcRemote ?? input.remote
    return readableFsPath(joinFsPath(fs, typeof remote === 'string' ? remote : undefined))
}

/** Remembers what a job operates on, so it can be labelled before rclone reports any transfer. */
export function rememberJobLabels(jobId: number | undefined, inputs: Record<string, any>[]) {
    if (typeof jobId !== 'number') {
        return
    }
    const labels = inputs.map(jobLabelFromInput).filter((l): l is string => !!l)
    if (labels.length === 0) {
        return
    }
    useStore.setState((state) => ({
        jobLabels: { ...state.jobLabels, [jobId]: labels },
    }))
}

async function fetchTransferred() {
    const transferredStats = await rclone('/core/transferred')

    return transferredStats?.transferred ?? []
}

type TransferredItem = Awaited<ReturnType<typeof fetchTransferred>>[number]
type JobStatus = NonNullable<Awaited<ReturnType<typeof fetchJobStatus>>>

function stringField(item: unknown, key: string) {
    const value =
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined
    return typeof value === 'string' && value ? value : undefined
}

async function fetchJob(
    jobId: number,
    {
        transferred,
        status,
        isRunning,
    }: { transferred: TransferredItem[]; status: JobStatus | null; isRunning: boolean }
): Promise<JobItem | null> {
    const group = `job/${jobId}`

    // Children of a job/batch are jobs too, but they report into the parent's group.
    if (status?.group && status.group !== group) {
        return null
    }

    const job = await rclone('/core/stats', { params: { query: { group } } }).catch(() => null)

    let hasError = !!status?.error
    const output = status?.output as { results?: unknown } | undefined
    if (!hasError && Array.isArray(output?.results)) {
        hasError = output.results.some((result: any) => !!result?.error)
    }

    const transferring = job?.transferring ?? []
    // core/stats reports `checking` as plain file names, not objects.
    const checkingNames = ((job?.checking ?? []) as unknown[])
        .map((c) => (typeof c === 'string' ? c : stringField(c, 'name')))
        .filter((c): c is string => !!c)
    const relatedItems = transferred.filter((t) => t.group === group)

    const sources = new Set<string>(useStore.getState().jobLabels[jobId] ?? [])

    if (sources.size === 0) {
        const items: unknown[] = [...relatedItems, ...transferring]
        const withSrc = items.filter((item) => stringField(item, 'srcFs'))

        if (items.length === 1 && withSrc.length === 1) {
            sources.add(
                readableFsPath(
                    joinFsPath(stringField(items[0], 'srcFs')!, stringField(items[0], 'name'))
                )
            )
        } else {
            for (const item of withSrc) {
                sources.add(readableFsPath(stringField(item, 'srcFs')!))
            }
        }

        // Downloads and deletes have no source fs, fall back to what is being written/removed.
        if (sources.size === 0) {
            for (const item of items) {
                const dstFs = stringField(item, 'dstFs')
                const name = stringField(item, 'name')
                const label = dstFs
                    ? joinFsPath(dstFs, items.length === 1 ? name : undefined)
                    : name
                if (label) {
                    sources.add(readableFsPath(label))
                }
            }
        }

        if (sources.size === 0) {
            for (const name of checkingNames) {
                sources.add(name)
            }
        }
    }

    if (sources.size === 0 && !hasError) {
        if (!isRunning) {
            return null
        }
        sources.add('Preparing…')
    }

    const bytes = job?.bytes ?? 0
    const totalBytes = job?.totalBytes ?? 0

    return {
        id: jobId,
        type: isRunning ? 'active' : 'inactive',
        bytes,
        totalBytes,
        speed: isRunning ? (job?.speed ?? 0) : 0,

        done: bytes === totalBytes,
        progress: totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0,
        hasError,

        sources: Array.from(sources),
        isChecking: isRunning && checkingNames.length > 0,
        checkingCount: isRunning ? checkingNames.length : 0,
        isDryRun: useStore.getState().dryRunJobIds.includes(jobId),
    }
}

// Finished jobs never change, so there is no need to re-fetch them on every poll.
const finishedJobCache = new Map<string, JobItem | null>()
const FETCH_JOB_CONCURRENCY = 8

export async function listTransfers() {
    const [jobList, transferred, allStats] = await Promise.all([
        rclone('/job/list').catch((error) => {
            console.error('[listTransfers] job/list failed', error)
            return null
        }),
        fetchTransferred(),
        rclone('/core/stats'),
    ])

    const runningIds = new Set<number>(jobList?.runningIds ?? [])
    const jobIds = new Set<number>(jobList?.jobids ?? [])

    // Jobs expire from job/list (60s by default on remote hosts) while their stats live on.
    for (const t of [...transferred, ...(allStats?.transferring ?? [])]) {
        if (t.group?.startsWith('job/')) {
            jobIds.add(Number(t.group.split('/')[1]))
        }
    }
    if (!jobList) {
        for (const t of allStats?.transferring ?? []) {
            if (t.group?.startsWith('job/')) {
                runningIds.add(Number(t.group.split('/')[1]))
            }
        }
    }

    const sortedIds = Array.from(jobIds)
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b)

    const results: (JobItem | null)[] = new Array(sortedIds.length).fill(null)
    let cursor = 0
    const worker = async () => {
        while (cursor < sortedIds.length) {
            const index = cursor++
            const jobId = sortedIds[index]
            const cacheKey = `${jobList?.executeId ?? ''}:${jobId}`

            if (!runningIds.has(jobId) && finishedJobCache.has(cacheKey)) {
                results[index] = finishedJobCache.get(cacheKey)!
                continue
            }

            const status = await fetchJobStatus(jobId).catch(() => null)
            const isRunning = status ? !status.finished : runningIds.has(jobId)
            const job = await fetchJob(jobId, { transferred, status, isRunning })

            if (status?.finished && jobList?.executeId) {
                finishedJobCache.set(cacheKey, job)
            }
            results[index] = job
        }
    }
    await Promise.all(Array.from({ length: FETCH_JOB_CONCURRENCY }, worker))

    const jobs = {
        active: [] as JobItem[],
        inactive: [] as JobItem[],
    }
    for (const job of results) {
        if (job) {
            jobs[job.type].push(job)
        }
    }

    console.log('[listTransfers] active:', jobs.active.length, 'inactive:', jobs.inactive.length)

    return jobs
}

/* OPERATIONS */
export async function startMount({
    source,
    destination,
    options,
}: {
    source: string
    destination: string
    options: {
        mount?: Record<string, FlagValue>
        vfs?: Record<string, FlagValue>
        filter?: Record<string, FlagValue>
        config?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    const currentPlatform = platform()
    let needsVolumeName = currentPlatform === 'macos'

    if (
        currentPlatform === 'windows' &&
        destination !== '*' &&
        !RE_WINDOWS_DRIVE_LETTER.test(destination)
    ) {
        needsVolumeName = true
    }

    const mountOptions = { ...(options.mount || {}) }

    const hasVolumeName = 'volname' in mountOptions && mountOptions.volname
    if (!hasVolumeName && needsVolumeName) {
        const segments = source.split(RE_PATH_SEPARATOR).filter(Boolean)
        console.log('[Mount] segments', segments)

        const sourcePath = segments.length === 1 ? segments[0].replace(/:/g, '') : segments.pop()
        console.log('[Mount] sourcePath', sourcePath)

        mountOptions.volname = `${sourcePath}-${Math.random().toString(36).substring(2, 3).toUpperCase()}`
    }

    const mergedOptions = {
        ...mountOptions,
        ...(options.config || {}),
        ...(options.vfs || {}),
        ...(options.filter || {}),
    }

    const { fullDirPath: srcFullDirPath, remoteName: srcRemoteName } = getFsInfo(source)

    const srcOptions =
        options.remotes && srcRemoteName && srcRemoteName in options.remotes
            ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
            : undefined

    if (destination === '*' && currentPlatform === 'windows') {
        await pRetry(
            async () =>
                await rclone('/mount/mount', {
                    params: {
                        query: {
                            fs: serializeOptions(srcFullDirPath, {
                                global: mergedOptions,
                                remote: srcOptions,
                            }),
                            mountPoint: '*',
                            mount: 'nfsmount',
                        },
                    },
                }),
            {
                retries: 3,
            }
        )
        return
    }

    const {
        root: dstRoot,
        filePath: dstFilePath,
        fullDirPath: dstFullDirPath,
    } = getFsInfo(destination)

    const dstFs = dstRoot === ':local:' ? ':local:/' : dstRoot
    const dstFilePathNormalized = dstFilePath.replace(RE_BACKSLASH, '/')

    let directoryExists: boolean | undefined

    try {
        const r = await pRetry(
            async () =>
                await rclone('/operations/stat', {
                    params: {
                        query: {
                            fs: dstFs,
                            remote: dstFilePathNormalized,
                        },
                    },
                }),
            {
                retries: 3,
            }
        )
        if (!r || !r.item) {
            directoryExists = false
        } else {
            if (!r.item.IsDir) {
                throw new Error('The selected directory is not a directory')
            }
            directoryExists = true
        }
    } catch (err) {
        console.error('[Mount] Error checking if directory exists:', err)
    }
    console.log('[Mount] directoryExists', directoryExists)

    const isPlatformWindows = platform() === 'windows'

    if (directoryExists) {
        let isEmpty = false
        try {
            const { list } = await pRetry(
                async () =>
                    await rclone('/operations/list', {
                        params: {
                            query: {
                                fs: dstRoot === ':local:' ? ':local:/' : dstRoot,
                                remote: dstFilePath,
                            },
                        },
                    }),
                {
                    retries: 3,
                }
            )
            isEmpty = !list || list.length === 0
        } catch (err) {
            console.error('[Mount] Error checking if directory is empty:', err)
        }

        if (!isEmpty) {
            throw new Error('The selected directory must be empty to mount a remote.')
        }

        if (isPlatformWindows) {
            try {
                await pRetry(
                    async () =>
                        await rclone('/operations/rmdir', {
                            params: {
                                query: {
                                    fs: dstRoot === ':local:' ? ':local:/' : dstRoot,
                                    remote: dstFilePath,
                                },
                            },
                        }),
                    {
                        retries: 3,
                    }
                )
            } catch (err) {
                console.error('[Mount] Error removing directory:', err)
            }
        }
    } else if (!isPlatformWindows) {
        try {
            await pRetry(
                async () =>
                    await rclone('/operations/mkdir', {
                        params: {
                            query: {
                                fs: dstRoot === ':local:' ? ':local:/' : dstRoot,
                                remote: dstFilePath,
                            },
                        },
                    }),
                {
                    retries: 3,
                }
            )
        } catch (error) {
            console.error('[Mount] Error creating directory:', error)
            throw new Error('Failed to create mount directory. Try creating it manually first.')
        }
    }

    await pRetry(
        async () =>
            await rclone('/mount/mount', {
                params: {
                    query: {
                        fs: serializeOptions(srcFullDirPath, {
                            global: mergedOptions,
                            remote: srcOptions,
                        }),
                        mountPoint: (() => {
                            if (platform() !== 'windows') {
                                return dstFullDirPath.replace(':local:', '/')
                            }
                            const mp = dstFullDirPath
                                .replace(':local:', '')
                                .replace(RE_BACKSLASH, '/')
                            if (/^[a-zA-Z]:\/$/.test(mp)) {
                                return mp.slice(0, -1)
                            }
                            return mp
                        })(),
                        mount: 'nfsmount',
                    },
                },
            }),
        {
            retries: 3,
        }
    )
}

export async function startBisync({
    source,
    destination,
    options,
}: {
    source: string
    destination: string
    options: {
        config?: Record<string, FlagValue>
        bisync?: Record<string, FlagValue>
        filter?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
        outer?: Record<string, FlagValue>
    }
}) {
    const sourceExists = await hasStat(source)
    if (!sourceExists) {
        throw new Error(`Source does not exist, ${source} is missing`)
    }

    const mergedOptions = {
        ...(options.config || {}),
        ...(options.bisync || {}),
        ...(options.filter || {}),
    }

    const { fullDirPath: srcFullDirPath, remoteName: srcRemoteName } = getFsInfo(source)
    const { fullDirPath: dstFullDirPath, remoteName: dstRemoteName } = getFsInfo(destination)

    const srcOptions =
        options.remotes && srcRemoteName && srcRemoteName in options.remotes
            ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
            : undefined

    const dstOptions =
        options.remotes && dstRemoteName && dstRemoteName in options.remotes
            ? (JSON.parse(options.remotes[dstRemoteName] as unknown as string) as any)
            : undefined

    const r = await pRetry(
        async () =>
            await rclone('/sync/bisync', {
                params: {
                    query: {
                        path1: serializeOptions(srcFullDirPath, {
                            global: mergedOptions,
                            remote: srcOptions,
                        }),
                        path2: serializeOptions(dstFullDirPath, {
                            remote: dstOptions,
                        }),
                        _async: true,
                        ...(options.outer && Object.keys(options.outer).length > 0
                            ? Object.fromEntries(
                                  Object.entries(options.outer).map(([key, value]) => [
                                      key,
                                      Array.isArray(value) ? value.join(',') : value,
                                  ])
                              )
                            : {}),
                    },
                },
            }),
        {
            retries: 3,
        }
    )

    rememberJobLabels(r?.jobid, [{ srcFs: srcFullDirPath }])

    if (!r?.jobid) {
        console.error('Failed to start job: missing jobid', r)
        throw new Error('Failed to start operation')
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const jobStatus = await pRetry(
        async () =>
            await rclone('/job/status', {
                params: {
                    query: {
                        jobid: r.jobid!,
                    },
                },
            }),
        {
            retries: 3,
        }
    ).catch(null)

    console.log('jobStatus', JSON.stringify(jobStatus, null, 2))

    if (!jobStatus) {
        console.error('Failed to start job:', r.jobid)
        throw new Error('Failed to start operation')
    }

    if (jobStatus.error) {
        console.error('Failed to start job:', r.jobid, jobStatus.error)
        throw new Error(jobStatus.error)
    }

    return r.jobid
}

export async function startSync({
    source,
    destination,
    options,
}: {
    source: string
    destination: string
    options: {
        config?: Record<string, FlagValue>
        sync?: Record<string, FlagValue>
        filter?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    const sourceExists = await hasStat(source)
    if (!sourceExists) {
        throw new Error(`Source does not exist, ${source} is missing`)
    }

    const mergedOptions = {
        ...(options.config || {}),
        ...(options.sync || {}),
        ...(options.filter || {}),
    }

    const { fullDirPath: srcFullDirPath, remoteName: srcRemoteName } = getFsInfo(source)
    const { fullDirPath: dstFullDirPath, remoteName: dstRemoteName } = getFsInfo(destination)

    const srcOptions =
        options.remotes && srcRemoteName && srcRemoteName in options.remotes
            ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
            : undefined

    const dstOptions =
        options.remotes && dstRemoteName && dstRemoteName in options.remotes
            ? (JSON.parse(options.remotes[dstRemoteName] as unknown as string) as any)
            : undefined

    const r = await pRetry(
        async () =>
            await rclone('/sync/sync', {
                params: {
                    query: {
                        srcFs: serializeOptions(srcFullDirPath, {
                            global: mergedOptions,
                            remote: srcOptions,
                        }),
                        dstFs: serializeOptions(dstFullDirPath, {
                            remote: dstOptions,
                        }),
                        createEmptySrcDirs: true,
                        _async: true,
                    },
                },
            }),
        {
            retries: 3,
        }
    )

    rememberJobLabels(r?.jobid, [{ srcFs: srcFullDirPath }])

    if (!r?.jobid) {
        console.error('Failed to start job: missing jobid', r)
        throw new Error('Failed to start operation')
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const jobStatus = await pRetry(
        async () =>
            await rclone('/job/status', {
                params: {
                    query: {
                        jobid: r.jobid!,
                    },
                },
            }),
        {
            retries: 3,
        }
    ).catch(null)

    console.log('jobStatus', JSON.stringify(jobStatus, null, 2))

    if (!jobStatus) {
        console.error('Failed to start job:', r.jobid)
        throw new Error('Failed to start operation')
    }

    if (jobStatus.error) {
        console.error('Failed to start job:', r.jobid, jobStatus.error)
        throw new Error(jobStatus.error)
    }

    return r.jobid
}

export async function startDelete({
    sources,
    options,
}: {
    sources: string[]
    options: {
        filter?: Record<string, FlagValue>
        config?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    for (const source of sources) {
        const sourceExists = await hasStat(source)
        if (!sourceExists) {
            throw new Error(`Source does not exist, ${source} is missing`)
        }
    }

    if (
        sources.length > 1 &&
        options.filter &&
        ('include' in options.filter || 'include_from' in options.filter)
    ) {
        throw new Error('Include rules are not supported with multiple sources')
    }

    const mergedOptions = {
        ...(options.config || {}),
        ...(options.filter || {}),
    }

    const pendingJobs: Parameters<typeof startBatch>[0] = []
    const handledSourcePaths: Record<string, true> = {}
    const folderSources = sources.filter((path) => path.endsWith('/') || path.endsWith('\\'))

    for (const source of sources) {
        if (handledSourcePaths[source]) {
            console.log('[Delete] skipping because source is already handled', source)
            continue
        }

        handledSourcePaths[source] = true

        const {
            root: srcRoot,
            filePath: srcFilePath,
            type: srcType,
            remoteName: srcRemoteName,
        } = getFsInfo(source)

        const srcOptions =
            options.remotes && srcRemoteName && srcRemoteName in options.remotes
                ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
                : undefined

        if (srcType === 'folder') {
            const jobParams: Parameters<typeof startBatch>[0][number] = {
                _path: 'operations/delete',
                fs: serializeOptions(source, {
                    global: mergedOptions,
                    remote: srcOptions,
                }),
            }
            pendingJobs.push(jobParams)
            continue
        }

        if (folderSources.some((folder) => source.startsWith(folder))) {
            console.log(
                '[Delete] skipping because source or parent folder is already handled',
                source
            )
            continue
        }

        const jobParams: Parameters<typeof startBatch>[0][number] = {
            _path: 'operations/deletefile',
            fs: serializeOptions(srcRoot, {
                global: mergedOptions,
                remote: srcOptions,
            }),
            remote: srcFilePath,
        }
        pendingJobs.push(jobParams)
    }

    return startBatch(pendingJobs)
}

export async function startPurge({
    sources,
    options,
}: {
    sources: string[]
    options: {
        config?: Record<string, FlagValue>
        remotes?: Record<string, Record<string, FlagValue>>
    }
}) {
    for (const source of sources) {
        const sourceExists = await hasStat(source)
        if (!sourceExists) {
            throw new Error(`Source does not exist, ${source} is missing`)
        }
    }

    const pendingJobs: Parameters<typeof startBatch>[0] = []
    const handledSourcePaths: Record<string, true> = {}

    for (const source of sources) {
        if (handledSourcePaths[source]) {
            console.log('[Purge] skipping because source is already handled', source)
            continue
        }

        handledSourcePaths[source] = true

        const {
            root: srcRoot,
            dirPath: srcDirPath,
            type: srcType,
            remoteName: srcRemoteName,
        } = getFsInfo(source)

        if (srcType !== 'folder') {
            throw new Error('Only folders can be purged')
        }

        const srcOptions =
            options.remotes && srcRemoteName && srcRemoteName in options.remotes
                ? (JSON.parse(options.remotes[srcRemoteName] as unknown as string) as any)
                : undefined

        const jobParams: Parameters<typeof startBatch>[0][number] = {
            _path: 'operations/purge',
            fs: serializeOptions(srcRoot, {
                global: options.config,
                remote: srcOptions,
            }),
            remote: srcDirPath,
        }
        pendingJobs.push(jobParams)
    }

    return startBatch(pendingJobs)
}

export async function startServe({
    type,
    fs,
    addr,
    _filter,
    _config,
    ...props
}: {
    type: string
    fs: string
    addr: string
    _filter?: Record<string, FlagValue>
    _config?: Record<string, FlagValue>
} & Record<string, FlagValue>) {
    return rclone('/serve/start', {
        params: {
            query: {
                type,
                fs,
                addr,
                _filter:
                    _filter && Object.keys(_filter).length > 0
                        ? JSON.stringify(parseRcloneOptions(_filter))
                        : undefined,
                _config:
                    _config && Object.keys(_config).length > 0
                        ? JSON.stringify(parseRcloneOptions(_config))
                        : undefined,
                ...(props && Object.keys(props).length > 0
                    ? Object.fromEntries(
                          Object.entries(props).map(([key, value]) => [
                              key,
                              Array.isArray(value) ? value.join(',') : value,
                          ])
                      )
                    : {}),
            },
        },
    })
}

export async function startBatch(inputs: ({ _path: string } & Record<string, any>)[]) {
    console.log('[startBatch] starting batch operation', {
        inputCount: inputs.length,
        paths: inputs.map((i) => i._path),
    })
    console.log('[startBatch] inputs', JSON.stringify(inputs, null, 2))

    const r = await pRetry(
        async () =>
            await rclone('/job/batch', {
                body: {
                    inputs,
                    _async: true,
                },
            }),
        {
            retries: 3,
        }
    )

    console.log('[startBatch] job created', { jobid: r.jobid })
    rememberJobLabels(r.jobid, inputs)

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const jobStatus = await pRetry(
        async () =>
            await rclone('/job/status', {
                params: {
                    query: {
                        jobid: r.jobid,
                    },
                },
            }),
        {
            retries: 3,
        }
    ).catch(null)

    console.log('[startBatch] jobStatus', {
        jobid: r.jobid,
        finished: jobStatus?.finished,
        success: jobStatus?.success,
        error: jobStatus?.error,
    })
    console.log('[startBatch] jobStatus full', JSON.stringify(jobStatus, null, 2))

    if (!jobStatus) {
        console.error('[startBatch] ERROR: job status is null', { jobid: r.jobid })
        throw new Error('Failed to start operation')
    }

    const output = jobStatus.output as any
    if (
        output?.results &&
        Array.isArray(output.results) &&
        output.results.length === inputs.length
    ) {
        const results = output.results
        const allFailed = results.every((res: any) => res.error)

        if (allFailed) {
            const errorMessages = results
                .map((res: any) => {
                    const path = res.input?.srcRemote || res.input?.dstRemote || 'unknown'
                    return `${path}: ${res.error}`
                })
                .join('\n')

            console.error('[startBatch] ERROR: all batch operations failed', {
                jobid: r.jobid,
                errorMessages,
            })
            throw new Error(errorMessages)
        }
    }

    if (jobStatus.error) {
        console.error('[startBatch] ERROR: job failed', { jobid: r.jobid, error: jobStatus.error })
        throw new Error(jobStatus.error)
    }

    console.log('[startBatch] SUCCESS', { jobid: r.jobid })
    return r.jobid
}

/* PASSWORD */
export async function removeConfigPassword() {
    console.log('[removeConfigPassword]')

    const state = useHostStore.getState()
    const activeConfig = state.activeConfigFile

    if (!activeConfig || !activeConfig.id) {
        throw new Error('No active configuration selected.')
    }

    if (!activeConfig.isEncrypted) {
        throw new Error('Configuration is not encrypted.')
    }

    try {
        await runRcloneCli(['config', 'encryption', 'remove'])
        state.updateConfigFile(activeConfig.id, {
            isEncrypted: false,
            pass: undefined,
            passCommand: undefined,
        })
        console.log('[removeConfigPassword] restarting rclone')
        await restartActiveRclone()
    } catch (error) {
        Sentry.captureException(error)
        await message(error instanceof Error ? error.message : 'Failed to disable encryption.', {
            title: 'Config Encryption',
            kind: 'error',
            okLabel: 'OK',
        })
        throw error
    }
}

export async function setConfigPassword(options: {
    password: string
    persist?: boolean
}) {
    console.log('[setConfigPassword]')

    const state = useHostStore.getState()
    const activeConfig = state.activeConfigFile

    if (!activeConfig || !activeConfig.id) {
        throw new Error('No active configuration selected.')
    }

    // if (!activeConfig.isEncrypted) {
    //     throw new Error('Configuration is not encrypted.')
    // }

    const password = options.password

    if (!password) {
        throw new Error('Password is required to update encryption.')
    }

    try {
        await runRcloneCli(['config', 'encryption', 'set'], [password, password])
        state.updateConfigFile(activeConfig.id, {
            isEncrypted: true,
            pass: options.persist ? password : undefined,
            passCommand: undefined,
        })

        console.log('[setConfigPassword] restarting rclone')
        await restartActiveRclone()
    } catch (error) {
        Sentry.captureException(error)
        await message(
            error instanceof Error ? error.message : 'Failed to update encryption password.',
            {
                title: 'Config Encryption',
                kind: 'error',
                okLabel: 'OK',
            }
        )
        throw error
    }
}

/* OTHERS */
export async function fetchServeList() {
    try {
        const response = await rclone('/serve/list')
        return response.list
    } catch (error) {
        console.error('[fetchServeList] failed to fetch active serves', error)
        return []
    }
}

export async function fetchMountList() {
    try {
        const response = await rclone('/mount/listmounts')
        return response.mountPoints
    } catch (error) {
        console.error('[fetchMountList] failed to fetch active mounts', error)
        return []
    }
}
