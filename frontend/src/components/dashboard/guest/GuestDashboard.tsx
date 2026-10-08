/**
 * GuestDashboard
 *
 * Landing page for unauthenticated candidates arriving via an invitation link.
 *
 * Layout is fully composable:
 *  - `showHeader`   – toggles the sticky page header (default: true)
 *  - `showFeatures` – toggles the features grid     (default: true)
 *  - `onJoin`       – override the default navigation handler
 *  - `className`    – extra classes on the outermost wrapper
 *
 * All layout sub-components live in `./guest/` and are independently
 * importable for testing or composition in other pages.
 */

import React, { useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { TechBackground } from '@/components/auth/components/TechBackground'
import { GuestPageHeader } from './GuestPageHeader'
import { GuestHeroText } from './GuestHeroText'
import { GuestFeatures } from './GuestFeatures'
import { GuestPipeline } from './GuestPipeline'
import { GuestClosingCta } from './GuestClosingCta'
import type { GuestDashboardProps } from './types'

export const GuestDashboard: React.FC<GuestDashboardProps> = ({
  onJoin,
  showHeader = true,
  showFeatures = true,
  className,
}) => {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const handleRecruiterStart = useCallback(() => {
    navigate('/register/recruiter')
  }, [navigate])

  const handleCandidateStart = useCallback(() => {
    if (onJoin) {
      onJoin('candidate-entry')
      return
    }
    navigate('/register')
  }, [navigate, onJoin])

  return (
    <div
      className={cn(
        'text-foreground selection:bg-primary/20 bg-background relative flex min-h-screen flex-col font-sans transition-colors duration-500',
        className,
      )}
    >
      <TechBackground />

      {showHeader && <GuestPageHeader />}

      <motion.main
        className="relative z-10 mx-auto flex w-full max-w-293 flex-1 flex-col overflow-hidden px-6 py-12 md:py-20 lg:px-12"
        id="main-content"
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.4, ease: 'easeOut' }}
      >
        <div className="mt-8 flex w-full flex-col items-center lg:mt-16">
          <GuestHeroText
            onRecruiterCta={handleRecruiterStart}
            onCandidateCta={handleCandidateStart}
          />
        </div>

        {showFeatures && <GuestFeatures />}

        {showFeatures && <GuestPipeline />}

        <GuestClosingCta onStart={handleRecruiterStart} />

        <footer className="border-border/20 text-muted-foreground/60 border-t py-8 text-center text-xs transition-colors duration-300">
          © 2026 SmartHire AI. Powered by AWS, Claude, Cohere and pgvector.
        </footer>
      </motion.main>
    </div>
  )
}
