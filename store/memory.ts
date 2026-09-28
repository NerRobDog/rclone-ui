import { shared } from 'use-broadcast-ts'
import { create } from 'zustand'

interface State {
    firstWindow: boolean

    startupStatus:
        | null
        | 'initializing'
        | 'initialized'
        | 'updating'
        | 'updated'
        | 'error'
        | 'fatal'

    startupDisplayed: boolean

    isRestartingRclone: boolean

    currentTheme: {
        app: 'light' | 'dark' | 'system'
        tray: 'light' | 'dark' | 'system'
    }

    cloudflaredTunnel: {
        pid: number
        url: string
    } | null

    dryRunJobIds: number[]

    /** Human-readable sources for jobs started from this app, keyed by job id. */
    jobLabels: Record<number, string[]>
}

export const useStore = create<State>()(
    shared(
        (_) => ({
            firstWindow: true,

            startupStatus: null,
            startupDisplayed: false,

            isRestartingRclone: false,

            currentTheme: {
                app: 'dark',
                tray: 'system',
            },

            cloudflaredTunnel: null,

            dryRunJobIds: [],

            jobLabels: {},
        }),
        { name: 'shared-store' }
    )
)
