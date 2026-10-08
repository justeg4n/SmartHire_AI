import { cn } from '@/lib/utils'

type AiStatusVariant = 'processing' | 'matched' | 'analyzing' | 'ranked' | 'idle' | 'error'

interface AiStatusBadgeProps {
  status: AiStatusVariant
  label?: string
  className?: string
  /** Show animated pulse dot */
  withPulse?: boolean
}

const statusConfig: Record<
  AiStatusVariant,
  {
    label: string
    dotColor: string
    textColor: string
    bgColor: string
    borderColor: string
    animate: boolean
  }
> = {
  processing: {
    label: 'AI Processing',
    dotColor: 'bg-primary',
    textColor: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    animate: true,
  },
  analyzing: {
    label: 'Analyzing',
    dotColor: 'bg-chart-2',
    textColor: 'text-chart-2',
    bgColor: 'bg-chart-2/10',
    borderColor: 'border-chart-2/30',
    animate: true,
  },
  matched: {
    label: 'AI Matched',
    dotColor: 'bg-primary',
    textColor: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/20',
    animate: false,
  },
  ranked: {
    label: 'AI Ranked',
    dotColor: 'bg-yellow-400',
    textColor: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400/30',
    animate: false,
  },
  idle: {
    label: 'Standby',
    dotColor: 'bg-muted-foreground',
    textColor: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-border',
    animate: false,
  },
  error: {
    label: 'Error',
    dotColor: 'bg-destructive',
    textColor: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    animate: false,
  },
}

/**
 * AiStatusBadge — Neon Protocol AI processing state indicator
 * Used for AI-driven insights: matching, ranking, analyzing states
 * - Animated pulse dot for active states
 * - Electric Teal for matched, purple for analyzing
 */
export function AiStatusBadge({ status, label, className, withPulse = true }: AiStatusBadgeProps) {
  const cfg = statusConfig[status]
  const displayLabel = label ?? cfg.label

  return (
    <span
      data-slot="ai-status-badge"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        cfg.bgColor,
        cfg.textColor,
        cfg.borderColor,
        className,
      )}
      role="status"
      aria-label={`AI Status: ${displayLabel}`}
    >
      {/* Pulse dot */}
      {withPulse && (
        <span className="relative flex size-1.5 shrink-0">
          {cfg.animate && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                cfg.dotColor,
                'animate-ping',
              )}
              style={{ animationDuration: '1.5s' }}
            />
          )}
          <span className={cn('relative inline-flex size-1.5 rounded-full', cfg.dotColor)} />
        </span>
      )}

      {/* Stars icon for matched/ranked */}
      {(status === 'matched' || status === 'ranked') && (
        <span className="material-icons text-[10px] leading-none" aria-hidden="true">
          ✦
        </span>
      )}

      {displayLabel}
    </span>
  )
}

export type { AiStatusBadgeProps, AiStatusVariant }
