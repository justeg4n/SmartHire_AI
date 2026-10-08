/**
 * Public API for the GuestDashboard feature module.
 *
 * Import the main page component:
 *   import { GuestDashboard } from '@/components/dashboard/guest'
 *
 * Import individual sub-components for composition or testing:
 *   import { GuestPageHeader, GuestFeatures } from '@/components/dashboard/guest'
 *
 * Import data / config for overrides:
 *   import { FEATURE_ITEMS } from '@/components/dashboard/guest'
 */

// Sub-components
export { GuestPageHeader } from './GuestPageHeader'
export { GuestHeroText } from './GuestHeroText'
export { GuestJoinForm } from './GuestJoinForm'
export { GuestFeatures } from './GuestFeatures'
export { GuestPipeline } from './GuestPipeline'
export { GuestClosingCta } from './GuestClosingCta'

// Static data & variants
export {
  FEATURE_ITEMS,
  PIPELINE_FLOWS,
  fadeInUpVariants,
  fadeInVariants,
  featureCardVariants,
} from './config'

// TypeScript types
export type {
  FeatureItem,
  PipelineFlow,
  GuestHeroTextProps,
  GuestJoinFormProps,
  GuestFeaturesProps,
  GuestDashboardProps,
} from './types'
