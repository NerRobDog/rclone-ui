import { cn } from '@heroui/react'

/**
 * A tally-light status: a small dot plus a label.
 * `live` uses the brand vermilion — the same meaning as a REC light on a camera.
 */
export default function StatusPill({
    label,
    tone = 'neutral',
    pulse = false,
    className,
}: {
    label: string
    tone?: 'live' | 'success' | 'warning' | 'danger' | 'neutral'
    pulse?: boolean
    className?: string
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-2 h-7 px-2.5 rounded-small border border-divider bg-content2',
                'text-tiny font-medium uppercase tracking-[0.08em] text-foreground-600',
                className
            )}
        >
            <span
                className={cn(
                    'size-2 rounded-full',
                    tone === 'live' && 'bg-primary',
                    tone === 'success' && 'bg-success',
                    tone === 'warning' && 'bg-warning',
                    tone === 'danger' && 'bg-danger',
                    tone === 'neutral' && 'bg-foreground-400',
                    pulse && 'animate-tally'
                )}
            />
            {label}
        </span>
    )
}
