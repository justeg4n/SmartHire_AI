/**
 * BrandingPanel
 *
 * Left-hand marketing column shown on auth pages (Login, Register, …).
 * Follows the active theme – light or dark – via Tailwind dark: variants.
 */

import { memo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Zap, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Avatar seeds used to generate deterministic dicebear portraits. */
const AVATAR_SEEDS = [123, 246, 369, 492] as const

// ---------------------------------------------------------------------------
// FeaturePill
// ---------------------------------------------------------------------------

interface FeaturePillProps {
  icon: ReactNode
  label: string
}

const FeaturePill = memo(function FeaturePill({ icon, label }: FeaturePillProps) {
  return (
    <span className="border-primary/25 bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
      {icon}
      {label}
    </span>
  )
})
FeaturePill.displayName = 'FeaturePill'

// ---------------------------------------------------------------------------
// BrandLogo
// ---------------------------------------------------------------------------

/** Logo mark + wordmark. Navigates to "/" on click. */
const BrandLogoSection = memo(function BrandLogoSection() {
  return (
    <Link
      to="/"
      className="group focus-visible:ring-primary relative z-10 flex items-center gap-3 rounded focus-visible:ring-2 focus-visible:outline-none"
      aria-label="SmartHire AI – go to home"
    >
      <div className="bg-surface flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg shadow-sm">
        <BrandLogo size={24} />
      </div>
      <span className="text-foreground group-hover:text-primary text-2xl font-bold tracking-tight transition-colors">
        SmartHire AI
      </span>
    </Link>
  )
})
BrandLogoSection.displayName = 'BrandLogoSection'

// ---------------------------------------------------------------------------
// SocialProof
// ---------------------------------------------------------------------------

/** Avatar stack with member-count copy. */
const SocialProof = memo(function SocialProof() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex -space-x-3" aria-hidden="true">
        {AVATAR_SEEDS.map((seed) => (
          <div
            key={seed}
            className="border-background bg-muted ring-border/50 h-9 w-9 overflow-hidden rounded-full border-2 ring-1"
          >
            <img
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=18181b`}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
      <div>
        <p className="text-foreground text-sm font-semibold">10,000+ teams</p>
        <p className="text-muted-foreground text-xs">already hiring smarter</p>
      </div>
    </div>
  )
})
SocialProof.displayName = 'SocialProof'

// ---------------------------------------------------------------------------
// StatsRow
// ---------------------------------------------------------------------------

const STATS = [
  { value: '4×', label: 'Faster hiring' },
  { value: '98%', label: 'Accuracy' },
  { value: '60%', label: 'Cost reduction' },
] as const

const StatsRow = memo(function StatsRow() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {STATS.map(({ value, label }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-foreground text-2xl font-extrabold tracking-tight">{value}</span>
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
        </div>
      ))}
    </div>
  )
})
StatsRow.displayName = 'StatsRow'

// ---------------------------------------------------------------------------
// MarketingContent
// ---------------------------------------------------------------------------

const MarketingContent = memo(function MarketingContent() {
  return (
    <div className="relative z-10 flex max-w-sm flex-col gap-8">
      {/* Feature pills */}
      <div className="flex flex-wrap gap-2">
        <FeaturePill icon={<Sparkles className="h-3 w-3" />} label="AI-powered" />
        <FeaturePill icon={<Zap className="h-3 w-3" />} label="Real-time" />
        <FeaturePill icon={<ShieldCheck className="h-3 w-3" />} label="Bias-free" />
      </div>

      {/* Headline */}
      <div>
        <h1 className="text-foreground mb-4 text-4xl leading-[1.1] font-extrabold tracking-tight lg:text-5xl">
          Recruitment,
          <br />
          <span className="from-primary via-primary to-primary-dim bg-linear-to-r bg-clip-text text-transparent">
            amplified by intelligence.
          </span>
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Create precise engineering interviews in seconds. Let AI screen thousands of candidates so
          you can focus on building the team.
        </p>
      </div>

      {/* Emerald divider */}
      <div className="via-primary/35 from-border h-px bg-linear-to-r to-transparent" />

      {/* Stats */}
      <StatsRow />

      {/* Neutral divider */}
      <div className="from-border h-px bg-linear-to-r to-transparent" />

      {/* Social proof */}
      <SocialProof />
    </div>
  )
})
MarketingContent.displayName = 'MarketingContent'

// ---------------------------------------------------------------------------
// BrandingPanel
// ---------------------------------------------------------------------------

export const BrandingPanel = memo(function BrandingPanel() {
  return (
    <aside
      className="text-foreground relative z-10 hidden h-full w-full max-w-125 shrink-0 flex-col items-start justify-center gap-14 py-12 lg:flex"
      aria-label="SmartHire AI branding"
    >
      <BrandLogoSection />
      <MarketingContent />
    </aside>
  )
})
BrandingPanel.displayName = 'BrandingPanel'
