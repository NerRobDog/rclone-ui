import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { UserCancelledError } from './errors'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // staleTime: 60_000,
            // gcTime: 3_600_000,
            retry: (failureCount, error) =>
                !(error instanceof UserCancelledError) && failureCount < 3,
        },
    },
})

const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'rclone-ui-persisted-query-cache',
    throttleTime: 1000,
})

persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    dehydrateOptions: {
        // Live transfer state is stale the moment it is written; restoring it only shows wrong data.
        shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && query.queryKey[0] !== 'transfers',
    },
})

export default queryClient
