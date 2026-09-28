import { Button, Kbd } from '@heroui/react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { platform } from '@tauri-apps/plugin-os'
import { exit } from '@tauri-apps/plugin-process'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo } from 'react'
import { openSmallWindow } from '../../lib/window'
import { useStore } from '../../store/memory'
import { usePersistedStore } from '../../store/persisted'
import StatusPill from '../components/StatusPill'
import { SatoruLockup } from '../components/brand/logo'

export default function Startup() {
    const startupStatus = useStore((state) => state.startupStatus)

    const isError = useMemo(
        () => startupStatus === 'error' || startupStatus === 'fatal',
        [startupStatus]
    )

    // Close window when it loses focus
    useEffect(() => {
        const currentWindow = getCurrentWindow()
        const unlisten = currentWindow.onFocusChanged(async ({ payload: focused }) => {
            if (!focused) {
                await currentWindow.hide()
                await currentWindow.destroy()
            }
        })

        return () => {
            unlisten.then((fn) => fn())
        }
    }, [])

    const onStart = useCallback(async () => {
        const currentWindow = getCurrentWindow()

        await currentWindow.hide()

        if (usePersistedStore.getState().acknowledgements.includes('onboarding')) {
            await invoke('show_toolbar')
        } else {
            usePersistedStore.setState((prev) => ({
                acknowledgements: [...prev.acknowledgements, 'onboarding'],
            }))
            await openSmallWindow({
                name: 'Onboarding',
                url: '/onboarding',
            })
        }

        await new Promise((resolve) => setTimeout(resolve, 690))

        await currentWindow.destroy()
    }, [])

    const onErrorAction = useCallback(async () => {
        if (startupStatus === 'error') {
            await getCurrentWindow().hide()
            await getCurrentWindow().destroy()
        } else {
            await exit(0)
        }
    }, [startupStatus])

    const isReady = startupStatus === 'initialized' || startupStatus === 'updated'
    const isBusy = startupStatus === 'initializing' || startupStatus === 'updating'
    const shortcut = platform() === 'macos' ? ['⌘', '⇧', '/'] : ['Ctrl', 'Shift', '/']

    const copy = isError
        ? {
              status: 'Ошибка',
              title: 'Не удалось запустить',
              body: 'Попробуйте ещё раз чуть позже. Если ошибка повторится, журнал работы лежит в настройках, в разделе About.',
          }
        : startupStatus === 'updating'
          ? {
                status: 'Обновление',
                title: 'Обновляем движок',
                body: 'Это займёт меньше минуты. Ваши файлы и настройки остаются на месте.',
            }
          : startupStatus === 'updated'
            ? {
                  status: 'Готово',
                  title: 'Движок обновлён',
                  body: 'Спасибо, что подождали. Можно продолжать работу.',
              }
            : isReady
              ? {
                    status: 'Готово',
                    title: 'Облако подключено',
                    body: 'Командная панель открывается сочетанием клавиш — из любого приложения, в том числе из монтажной программы.',
                }
              : {
                    status: 'Запуск',
                    title: 'Подключаемся к облаку',
                    body: 'Проверяем соединение и готовим рабочее пространство.',
                }

    return (
        <div
            lang="ru"
            className="flex flex-col h-screen overflow-hidden border rounded-large bg-content1 border-divider"
        >
            <header className="flex items-center justify-between px-7 pt-6">
                <SatoruLockup size="md" />
                <StatusPill
                    label={copy.status}
                    tone={isError ? 'danger' : isReady ? 'success' : 'live'}
                    pulse={isBusy}
                />
            </header>

            <div className="flex flex-col justify-center flex-1 gap-4 px-7">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={copy.title}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-3 max-w-[560px]"
                    >
                        <h1 className="text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">
                            {copy.title}
                        </h1>
                        <p className="text-base leading-relaxed text-foreground-500">{copy.body}</p>
                        {isReady && (
                            <div className="flex items-center gap-1.5 pt-2">
                                {shortcut.map((key) => (
                                    <Kbd
                                        key={key}
                                        classNames={{
                                            base: 'min-w-8 h-8 justify-center bg-content3 shadow-none border border-divider font-mono text-sm',
                                        }}
                                    >
                                        {key}
                                    </Kbd>
                                ))}
                                <span className="ml-2 text-small text-foreground-500">
                                    командная панель
                                </span>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <footer className="flex items-center justify-between h-20 px-7 border-t border-divider bg-content2">
                <p className="text-tiny text-foreground-400">
                    Хранилище для видеопродакшена и студий подкастов
                </p>
                <AnimatePresence mode="wait">
                    {isReady && (
                        <motion.div
                            key="start"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <Button
                                color="primary"
                                radius="sm"
                                className="px-6 font-medium"
                                onPress={onStart}
                            >
                                Начать работу
                            </Button>
                        </motion.div>
                    )}
                    {isError && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <Button
                                variant="bordered"
                                radius="sm"
                                className="px-6"
                                onPress={onErrorAction}
                            >
                                {startupStatus === 'error' ? 'Понятно' : 'Выйти'}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </footer>
        </div>
    )
}
