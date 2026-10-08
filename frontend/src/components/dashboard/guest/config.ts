/**
 * GuestDashboard – static data and shared animation variants.
 *
 * Defining motion variants and static arrays **outside** any component avoids
 * re-creating identical objects on every render, giving a small but real
 * performance win and making the values trivially unit-testable.
 */

import { Activity, BookText, ScanSearch, Shield } from 'lucide-react'
import type { FeatureItem, PipelineFlow } from './types'

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

export const FEATURE_ITEMS: FeatureItem[] = [
  {
    id: 'ai-matching',
    icon: Activity,
    title: 'Smart Candidate Matching',
    description:
      'Get AI-powered candidate recommendations that match your job requirements. SmartHire analyzes skills and experience in real-time.',
  },
  {
    id: 'blind-screening',
    icon: Shield,
    title: 'Fair & Unbiased Screening',
    description:
      'Remove bias from hiring with intelligent CV analysis. Focus on qualifications and fit, not names or backgrounds.',
  },
  {
    id: 'hybrid-scoring',
    icon: ScanSearch,
    title: 'Precision Ranking',
    description:
      'Smart algorithms combine multiple scoring methods to find your best candidates, not just keyword matches.',
  },
  {
    id: 'interview-guides',
    icon: BookText,
    title: 'AI Interview Coaching',
    description:
      'Get personalized interview questions for each candidate profile. Run structured, fair interviews in minutes.',
  },
]

export const PIPELINE_FLOWS: PipelineFlow[] = [
  {
    id: 'recruiter-workflow',
    title: 'For Recruiters',
    steps: [
      'Post your job with key requirements and skills',
      'SmartHire intelligently reviews all applicant profiles',
      'Get a ranked list of top-matched candidates',
      'Review shortlists and move to interviews',
    ],
  },
  {
    id: 'candidate-workflow',
    title: 'For Job Seekers',
    steps: [
      'Create your profile once and upload your CV',
      'Discover jobs that fit your skills and experience',
      'Apply to opportunities that matter to you',
      'Connect with companies looking for your expertise',
    ],
  },
]

// ---------------------------------------------------------------------------
// Framer Motion / motion-react variants
//
// Using the `custom` prop + variant functions lets a single variant object
// encode the stagger delay without needing inline `transition` objects
// scattered across every JSX element.
// ---------------------------------------------------------------------------

/** Fade in while sliding up. Pass a numeric delay (seconds) via `custom`. */
export const fadeInUpVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay },
  }),
}

/** Simple fade-in only. Pass a numeric delay (seconds) via `custom`. */
export const fadeInVariants = {
  hidden: { opacity: 0 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay },
  }),
}

/** Feature card entrance — whileInView stagger. Pass index as `custom`. */
export const featureCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: index * 0.15 },
  }),
}
