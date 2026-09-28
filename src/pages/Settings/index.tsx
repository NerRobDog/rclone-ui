import { Button, Input, Spinner, Tab, Tabs, Tooltip, cn } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { getVersion as getUiVersion } from '@tauri-apps/api/app'
import { message } from '@tauri-apps/plugin-dialog'
import { platform } from '@tauri-apps/plugin-os'
import {
    CodeIcon,
    CogIcon,
    EyeIcon,
    GlobeIcon,
    InfoIcon,
    KeyboardIcon,
    MedalIcon,
    SatelliteDishIcon,
    ServerIcon,
    TabletSmartphoneIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LOCAL_HOST_ID } from '../../../lib/hosts'
import rclone from '../../../lib/rclone/client'
import { useStore } from '../../../store/memory'
import { usePersistedStore } from '../../../store/persisted'
import { SatoruLockup } from '../../components/brand/logo'
import AboutSection from './AboutSection'
import ConfigSection from './ConfigSection'
import GeneralSection from './GeneralSection'
import HostsSection from './HostsSection'
import LicenseSection from './LicenseSection'
import MobileSection from './MobileSection'
import ProxySection from './ProxySection'
import RemotesSection from './RemotesSection'
import ToolbarSection from './ToolbarSection'

export default function Settings() {
    const [searchParams] = useSearchParams()
    const settingsPass = usePersistedStore((state) => state.settingsPass)
    const currentHost = usePersistedStore((state) => state.currentHost)
    const isRestartingRclone = useStore((state) => state.isRestartingRclone)
    const isLocalHost = useMemo(() => currentHost?.id === LOCAL_HOST_ID, [currentHost?.id])

    const defaultSelectedTab = useMemo(() => searchParams.get('tab') || 'general', [searchParams])

    const [passwordCheckInput, setPasswordCheckInput] = useState('')
    const [passwordCheckPassed, setPasswordCheckPassed] = useState(false)
    const [passwordVisible, setPasswordVisible] = useState(false)

    const { data: uiVersion } = useQuery({
        queryKey: ['versions', 'ui'],
        queryFn: async () => {
            const uiVersion = await getUiVersion()
            return uiVersion.endsWith('.0') ? uiVersion.slice(0, -2) : uiVersion
        },
    })

    const cliVersionQuery = useQuery({
        queryKey: ['versions', 'cli'],
        queryFn: async () => {
            const cliVersion = await rclone('/core/version')
            return cliVersion.version.replace('v', '')
        },
    })

    useEffect(() => {
        console.log('[Settings] cliVersionQuery', 'CHANGED')
        console.log('[Settings] cliVersionQuery.data', cliVersionQuery.data)
        console.log('[Settings] cliVersionQuery.isLoading', cliVersionQuery.isLoading)
        console.log('[Settings] cliVersionQuery.isError', cliVersionQuery.isError)
        console.log('[Settings] cliVersionQuery.isFetching', cliVersionQuery.isFetching)
        console.log('[Settings] cliVersionQuery.error?.message', cliVersionQuery.error?.message)
    }, [cliVersionQuery])

    const cliVersion = useMemo(() => {
        return cliVersionQuery.data
    }, [cliVersionQuery.data])

    if (!defaultSelectedTab) return null

    if (isRestartingRclone) {
        return (
            <div className="flex flex-col items-center justify-center w-screen h-screen gap-10 overflow-hidden animate-fade-in">
                <Spinner size="lg" className="scale-150" />
                <p className="text-lg text-center text-foreground-500">Restarting the engine…</p>
            </div>
        )
    }

    if (settingsPass && !passwordCheckPassed) {
        return (
            <div className="flex flex-col items-center justify-center w-screen h-screen gap-4 overflow-hidden animate-fade-in">
                <Input
                    placeholder="Enter pin or password"
                    value={passwordCheckInput}
                    onChange={(e) => setPasswordCheckInput(e.target.value)}
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    type={passwordVisible ? 'text' : 'password'}
                    fullWidth={false}
                    size="lg"
                    endContent={
                        <Button
                            onPress={() => setPasswordVisible(!passwordVisible)}
                            isIconOnly={true}
                            variant="light"
                            data-focus-visible="false"
                        >
                            <EyeIcon className="w-5 h-5" />
                        </Button>
                    }
                />
                <Button
                    onPress={async () => {
                        if (passwordCheckInput === settingsPass) {
                            setPasswordCheckPassed(true)
                            return
                        }

                        await message('The password you entered is incorrect.', {
                            title: 'Login failed',
                            kind: 'error',
                        })
                    }}
                    data-focus-visible="false"
                    color="primary"
                >
                    Open
                </Button>
            </div>
        )
    }

    return (
        <div className={cn('relative flex flex-col w-screen h-screen gap-0 overflow-hidden')}>
            <div
                className={cn(
                    'absolute top-0 left-0 z-10 flex items-center w-56 px-5 h-16 pointer-events-none',
                    platform() === 'macos' && 'top-7'
                )}
            >
                <SatoruLockup size="sm" />
            </div>
            <Tabs
                aria-label="Options"
                isVertical={true}
                variant="light"
                destroyInactiveTabPanel={false}
                disableAnimation={true}
                className="flex-shrink-0 h-screen px-3 pb-16 border-r w-56 bg-content1 border-divider"
                classNames={{
                    tabList: cn('w-full gap-0.5 pt-16', platform() === 'macos' && 'pt-24'),
                    tab: 'h-9 justify-start px-3 rounded-medium',
                    cursor: 'bg-content3 shadow-none rounded-medium',
                    tabContent: cn(
                        'text-foreground-500 group-data-[hover=true]:text-foreground',
                        'group-data-[selected=true]:text-foreground group-data-[selected=true]:[&_svg]:text-primary'
                    ),
                }}
                size="md"
                defaultSelectedKey={defaultSelectedTab}
                radius="sm"
            >
                <Tab
                    key="general"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <CogIcon className="size-4" />
                            <span>General</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <GeneralSection />
                </Tab>
                <Tab
                    key="toolbar"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <KeyboardIcon className="size-4" />
                            <span>Toolbar</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <ToolbarSection />
                </Tab>
                <Tab
                    key="remotes"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <ServerIcon className="size-4" />
                            <span>Remotes</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <RemotesSection />
                </Tab>
                <Tab
                    key="hosts"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <GlobeIcon className="size-4" />
                            <span>Hosts</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <HostsSection />
                </Tab>
                <Tab
                    key="config"
                    title={
                        <Tooltip
                            content={
                                currentHost?.id !== 'local'
                                    ? 'Config settings are only available when using your local machine, not a remote host'
                                    : undefined
                            }
                            isDisabled={currentHost?.id === 'local'}
                            placement="right"
                            size="lg"
                            color="foreground"
                            className="max-w-48"
                            offset={90}
                        >
                            <div className="flex items-center gap-2.5 font-medium">
                                <CodeIcon className="size-4" />
                                <span>Config</span>
                            </div>
                        </Tooltip>
                    }
                    data-focus-visible="false"
                    isDisabled={currentHost?.id !== 'local'}
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <ConfigSection />
                </Tab>
                <Tab
                    key="proxy"
                    title={
                        // <Tooltip
                        //     content={
                        //         currentHost?.id !== 'local'
                        //             ? 'Proxy settings are only available when using your local machine, not a remote host'
                        //             : undefined
                        //     }
                        //     isDisabled={currentHost?.id === 'local'}
                        //     placement="right"
                        //     size="lg"
                        //     color="foreground"
                        //     className="max-w-48"
                        //     offset={97}
                        // >
                        <div className="flex items-center gap-2.5 font-medium">
                            <SatelliteDishIcon className="size-4" />
                            <span>Proxy</span>
                        </div>
                        // </Tooltip>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <ProxySection />
                </Tab>
                <Tab
                    key="mobile"
                    title={
                        <Tooltip
                            content={
                                currentHost?.id !== 'local'
                                    ? 'Mobile access is only available when using your local machine, not a remote host'
                                    : undefined
                            }
                            isDisabled={currentHost?.id === 'local'}
                            placement="right"
                            size="lg"
                            color="foreground"
                            className="max-w-48"
                            offset={90}
                        >
                            <div className="flex items-center gap-2.5 font-medium">
                                <TabletSmartphoneIcon className="size-4" />
                                <span>Mobile</span>
                            </div>
                        </Tooltip>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <MobileSection />
                </Tab>
                <Tab
                    key="license"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <MedalIcon className="size-4" />
                            <span>License</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <LicenseSection />
                </Tab>
                <Tab
                    key="about"
                    title={
                        <div className="flex items-center gap-2.5 font-medium">
                            <InfoIcon className="size-4" />
                            <span>About</span>
                        </div>
                    }
                    data-focus-visible="false"
                    className="w-full max-h-screen p-0 overflow-scroll overscroll-none"
                >
                    <AboutSection />
                </Tab>
            </Tabs>
            <div className="absolute bottom-0 left-0 flex flex-col justify-center w-56 h-16 gap-1 px-5 border-t border-r bg-content1 border-divider">
                <span className="flex items-center gap-2 text-tiny text-foreground-600">
                    <span
                        className={cn(
                            'size-1.5 rounded-full',
                            isLocalHost || !currentHost ? 'bg-success' : 'bg-primary animate-tally'
                        )}
                    />
                    <span className="truncate">
                        {isLocalHost || !currentHost
                            ? 'This computer'
                            : `Connected to ${currentHost.name}`}
                    </span>
                </span>
                <span className="font-mono text-[10px] text-foreground-400">
                    v{uiVersion} · engine {cliVersion ?? '…'}
                </span>
            </div>
        </div>
    )
}
