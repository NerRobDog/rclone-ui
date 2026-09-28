import { Button, cn } from '@heroui/react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { platform } from '@tauri-apps/plugin-os'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { SatoruLockup } from '../components/brand/logo'

const SHORTCUT = platform() === 'macos' ? '⌘ ⇧ /' : 'Ctrl Shift /'

const SLIDES = [
    {
        scene: 'Загрузили',
        title: 'Облако как обычный диск',
        description:
            'Подключите облако как диск в системе: папки проекта видны в Finder и Проводнике, их можно открыть из любой программы.',
        where: 'Mount',
    },
    {
        scene: 'Разложили',
        title: 'Большие файлы — целиком',
        description:
            'Копирование и синхронизация папок без ограничения на размер одного файла. Исходник на 200 ГиБ передаётся одним куском, без нарезки на части.',
        where: 'Copy · Sync',
    },
    {
        scene: 'Сохранили',
        title: 'Архив по расписанию',
        description:
            'Задайте расписание один раз — папка проекта будет уезжать в облако сама, например ночью, когда канал свободен.',
        where: 'Schedules',
    },
    {
        scene: 'Начали',
        title: 'Всё — из командной панели',
        description: `Нажмите ${SHORTCUT} в любом приложении, начните печатать название папки или действия — и выберите нужное с клавиатуры.`,
        where: SHORTCUT,
    },
] as const

export default function Onboarding() {
    const [currentSlide, setCurrentSlide] = useState(0)
    const [direction, setDirection] = useState(1) // 1 for forward, -1 for backward
    const [isFinishing, setIsFinishing] = useState(false)

    const slide = useMemo(() => SLIDES[currentSlide], [currentSlide])
    const isFirstSlide = useMemo(() => currentSlide === 0, [currentSlide])
    const isLastSlide = useMemo(() => currentSlide === SLIDES.length - 1, [currentSlide])

    const handleFinish = useCallback(async () => {
        const currentWindow = getCurrentWindow()

        if (platform() === 'windows') {
            await currentWindow.hide()
            await new Promise((resolve) => setTimeout(resolve, 690))
            await invoke('show_toolbar')
            await currentWindow.destroy()
            return
        }

        await currentWindow.setAlwaysOnTop(false)
        setIsFinishing(true)

        await invoke('show_toolbar')
        await new Promise((resolve) => setTimeout(resolve, 400))
        await currentWindow.hide()
        await currentWindow.destroy()
    }, [])

    const handleNext = useCallback(() => {
        if (isLastSlide) {
            handleFinish()
            return
        }
        setDirection(1)
        setCurrentSlide((prev) => prev + 1)
    }, [isLastSlide, handleFinish])

    const handleBack = useCallback(() => {
        if (isFirstSlide) return
        setDirection(-1)
        setCurrentSlide((prev) => prev - 1)
    }, [isFirstSlide])

    const take = String(currentSlide + 1).padStart(2, '0')
    const total = String(SLIDES.length).padStart(2, '0')

    return (
        <div
            lang="ru"
            className="flex flex-col items-center justify-center w-full h-screen p-0.5 bg-transparent"
        >
            <div
                className={cn(
                    'flex flex-col w-full h-full overflow-hidden border bg-content1 border-divider rounded-large transition-opacity duration-300',
                    isFinishing ? 'opacity-0' : 'opacity-100'
                )}
            >
                {/* Slate: the clapper sticks and the fields a 2nd AC writes before every take */}
                <div
                    aria-hidden="true"
                    className="h-3 shrink-0 bg-[repeating-linear-gradient(135deg,hsl(var(--heroui-content4))_0_14px,transparent_14px_28px)]"
                />
                <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-divider shrink-0">
                    <SlateField label="Проект">
                        <SatoruLockup size="sm" />
                    </SlateField>
                    <SlateField label="Сцена">
                        <span className="font-mono">
                            {take}
                            <span className="text-foreground-400">/{total}</span>
                        </span>
                    </SlateField>
                    <SlateField label="Этап">{slide.scene}</SlateField>
                    <SlateField label="Где" last={true}>
                        <span className="font-mono text-small">{slide.where}</span>
                    </SlateField>
                </div>

                <div className="relative flex flex-col justify-center flex-1 px-10 overflow-hidden">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={currentSlide}
                            custom={direction}
                            initial={{ opacity: 0, x: direction * 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: direction * -24 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col gap-4 max-w-[600px]"
                        >
                            <h1 className="text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">
                                {slide.title}
                            </h1>
                            <p className="text-base leading-relaxed text-foreground-500">
                                {slide.description}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="flex items-center justify-between h-20 px-6 border-t shrink-0 border-divider bg-content2">
                    <div
                        className="flex items-center gap-1.5"
                        aria-label={`Шаг ${currentSlide + 1} из ${SLIDES.length}`}
                    >
                        {SLIDES.map((item, index) => (
                            <span
                                key={item.title}
                                className={cn(
                                    'h-1 rounded-full transition-all duration-300',
                                    index === currentSlide ? 'w-6 bg-primary' : 'w-3 bg-content4'
                                )}
                            />
                        ))}
                    </div>
                    <div className="flex flex-row gap-2">
                        {!isFirstSlide && (
                            <Button
                                variant="light"
                                radius="sm"
                                onPress={handleBack}
                                startContent={<ChevronLeftIcon className="size-4" />}
                                className="gap-1"
                            >
                                Назад
                            </Button>
                        )}
                        <Button
                            color="primary"
                            radius="sm"
                            onPress={handleNext}
                            endContent={
                                isLastSlide ? undefined : <ChevronRightIcon className="size-4" />
                            }
                            className="gap-1 px-5 font-medium"
                        >
                            {isFirstSlide ? 'Начать' : isLastSlide ? 'Открыть панель' : 'Дальше'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function SlateField({
    label,
    children,
    last = false,
}: {
    label: string
    children: React.ReactNode
    last?: boolean
}) {
    return (
        <div className={cn('flex flex-col gap-1 px-5 py-3', !last && 'border-r border-divider')}>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-400">
                {label}
            </span>
            <span className="flex items-center font-medium h-6 text-foreground">{children}</span>
        </div>
    )
}
