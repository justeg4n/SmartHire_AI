import { cn } from '@/lib/utils'

interface MatchScoreGaugeProps {
  /** Score 0–100 */
  score: number
  /** Display size */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Show percentage label inside */
  showLabel?: boolean
  /** Custom label text (overrides score%) */
  label?: string
  className?: string
  /** Animate on mount */
  animated?: boolean
}

const sizeConfig = {
  sm: { r: 28, stroke: 4, viewBox: 72, fontSize: 'text-sm', labelSize: 'text-[10px]' },
  md: { r: 40, stroke: 5, viewBox: 96, fontSize: 'text-lg', labelSize: 'text-xs' },
  lg: { r: 56, stroke: 6, viewBox: 128, fontSize: 'text-2xl', labelSize: 'text-xs' },
  xl: { r: 80, stroke: 8, viewBox: 180, fontSize: 'text-4xl', labelSize: 'text-sm' },
}

/**
 * Neon Protocol MatchScoreGauge
 * Circular SVG gauge — Stitch "Candidate HUD" special component
 *
 * - Stroke: primary Electric Teal (#0FFFE0)
 * - Track: surface_container_highest (#25252e)
 * - Center: display metric (Space Grotesk)
 * - Glow effect at high scores (>= 80%)
 */
export function MatchScoreGauge({
  score,
  size = 'md',
  showLabel = true,
  label,
  className,
  animated = true,
}: MatchScoreGaugeProps) {
  const cfg = sizeConfig[size]
  const cx = cfg.viewBox / 2
  const cy = cfg.viewBox / 2
  const r = cfg.r
  const circumference = 2 * Math.PI * r
  // Start from top (−90deg)
  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = circumference - (clampedScore / 100) * circumference

  // Color logic: dim at low scores, full teal at high scores
  const scoreColor =
    clampedScore >= 80
      ? 'var(--primary)'
      : clampedScore >= 60
        ? 'var(--primary)'
        : clampedScore >= 40
          ? 'var(--primary)'
          : 'var(--muted-foreground)'

  const glowFilter = clampedScore >= 75 ? 'drop-shadow(0 0 6px var(--primary))' : undefined

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="meter"
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Match score: ${clampedScore}%`}
    >
      <svg
        width={cfg.viewBox}
        height={cfg.viewBox}
        viewBox={`0 0 ${cfg.viewBox} ${cfg.viewBox}`}
        style={{ filter: glowFilter }}
      >
        {/* Track: theme-aware muted edge */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={cfg.stroke}
          opacity={0.5}
        />

        {/* Score arc: Electric Teal gradient */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={scoreColor}
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? circumference : offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={
            animated
              ? {
                  transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  strokeDashoffset: offset,
                }
              : undefined
          }
        />
      </svg>

      {/* Center label */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-display leading-none font-bold tabular-nums',
              cfg.fontSize,
              clampedScore >= 75 ? 'text-primary' : 'text-foreground',
            )}
          >
            {label ?? `${clampedScore}`}
          </span>
          {!label && (
            <span className={cn('text-muted-foreground font-sans', cfg.labelSize)}>%</span>
          )}
        </div>
      )}
    </div>
  )
}

export type { MatchScoreGaugeProps }
