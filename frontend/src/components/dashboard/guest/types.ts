/**
 * GuestDashboard – shared TypeScript interfaces.
 *
 * Keep types co-located with the feature so they are easy to find and extend.
 */

import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/** A single feature card rendered in the features grid. */
export interface FeatureItem {
  /** Stable unique key used as React `key` prop. */
  id: string
  /** Lucide icon component to display. */
  icon: LucideIcon
  title: string
  description: string
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

/** Props for the standalone join-form card. */
export interface GuestJoinFormProps {
  /** Called with the trimmed invite/authorization code when the form submits. */
  onSubmit: (code: string) => void
}

export interface GuestHeroTextProps {
  onRecruiterCta: () => void
  onCandidateCta: () => void
}

/** Props for the configurable features grid. */
export interface GuestFeaturesProps {
  /**
   * Override the default feature items list.
   * Defaults to `FEATURE_ITEMS` from `config.ts`.
   */
  items?: FeatureItem[]
}

export interface PipelineFlow {
  id: string
  title: string
  steps: string[]
}

/**
 * Top-level layout props for `GuestDashboard`.
 *
 * These props let consuming code toggle sections on/off and inject
 * custom behaviour without duplicating layout logic.
 */
export interface GuestDashboardProps {
  /**
   * Override the default join handler.
   * Default: navigates to `/interview?code=<encoded-code>`.
   */
  onJoin?: (code: string) => void
  /**
   * Show or hide the sticky page header.
   * @default true
   */
  showHeader?: boolean
  /**
   * Show or hide the features grid section.
   * @default true
   */
  showFeatures?: boolean
  /**
   * Extra Tailwind class(es) merged onto the outermost wrapper.
   * Useful for embedding the dashboard inside a test harness or modal.
   */
  className?: string
}
