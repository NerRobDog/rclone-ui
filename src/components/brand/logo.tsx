import { cn } from '@heroui/react'

/**
 * The satoru mark: a shu (vermilion) dot over a horizon line.
 * The dot doubles as the REC tally, the hanko seal and the dot in "satoru.link".
 */
export function SatoruMark({
    className,
    variant = 'tile',
}: {
    className?: string
    variant?: 'tile' | 'glyph'
}) {
    if (variant === 'glyph') {
        return (
            <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
                <circle cx="32" cy="26" r="10" className="fill-primary" />
                <rect x="14" y="43" width="36" height="5" rx="2.5" className="fill-foreground" />
            </svg>
        )
    }

    return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#131315" />
            <circle cx="32" cy="26" r="10" fill="#E0431C" />
            <rect x="14" y="43" width="36" height="5" rx="2.5" fill="#ECEAE6" />
        </svg>
    )
}

export function SatoruWordmark({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-baseline font-semibold tracking-[-0.02em] text-foreground',
                className
            )}
        >
            satoru
            <span className="text-primary">.</span>
            <span className="font-normal text-foreground-500">link</span>
        </span>
    )
}

export function SatoruLockup({
    className,
    size = 'md',
}: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5', className)}>
            <SatoruMark
                className={cn(
                    size === 'sm' && 'size-5',
                    size === 'md' && 'size-7',
                    size === 'lg' && 'size-10'
                )}
            />
            <SatoruWordmark
                className={cn(
                    size === 'sm' && 'text-sm',
                    size === 'md' && 'text-lg',
                    size === 'lg' && 'text-3xl'
                )}
            />
        </span>
    )
}
