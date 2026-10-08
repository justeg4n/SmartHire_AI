/**
 * GuestHeroText — Neon Protocol
 *
 * Left hero copy block on the landing page.
 * Stitch title: "The Future of Tech Hiring"
 * "Zero bias. Maximum signal."
 *
 * Headline animation (Neon Protocol edition):
 *  1. Word-mask reveal for "The Future Of" words
 *  2. Electric Teal shimmer gradient on "Tech Hiring"
 *  3. "Systems Online" badge → replaced with Neon Protocol AI status indicator
 */

import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GuestHeroTextProps } from './types'

const HEADLINE_WORDS = ['Intelligent', 'Hiring']
const WORD_STAGGER = 0.07
const HEADLINE_DELAY = 0.2

export const GuestHeroText = memo(function GuestHeroText({
  onRecruiterCta,
  onCandidateCta,
}: GuestHeroTextProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="flex w-full max-w-4xl flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.45, ease: 'easeOut' }}
        className="mb-7"
      >
        <span
          className="bg-primary text-primary-foreground inline-flex h-7 items-center rounded-full px-6 text-xs font-semibold tracking-[0.18rem] uppercase"
          aria-label="Powered by AI"
        >
          Powered by AI
        </span>
      </motion.div>

      <h1 className="font-display text-foreground mb-6 text-5xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
        {/* Word-mask reveal */}
        <span className="inline-flex flex-wrap justify-center gap-x-3">
          {HEADLINE_WORDS.map((word, i) => (
            <span key={word} className="inline-block overflow-hidden pb-1 leading-none">
              <motion.span
                className="inline-block"
                initial={{ y: shouldReduceMotion ? '0%' : '110%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{
                  delay: HEADLINE_DELAY + i * WORD_STAGGER,
                  duration: shouldReduceMotion ? 0.1 : 0.55,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </span>

        <br />

        {/* Electric Teal shimmer gradient on "Beyond Resumes" */}
        <span className="inline-block overflow-hidden pb-1 leading-none">
          <motion.span
            className="animate-gradient-x from-primary via-primary/80 to-primary/60 inline-block bg-linear-to-r bg-size-[200%_auto] bg-clip-text text-transparent"
            initial={{ y: shouldReduceMotion ? '0%' : '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{
              delay: HEADLINE_DELAY + HEADLINE_WORDS.length * WORD_STAGGER,
              duration: shouldReduceMotion ? 0.1 : 0.65,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            Beyond Resumes
          </motion.span>
        </span>
      </h1>

      <motion.p
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: HEADLINE_DELAY + (HEADLINE_WORDS.length + 1) * WORD_STAGGER + 0.16,
          duration: shouldReduceMotion ? 0.1 : 0.45,
        }}
        className="text-muted-foreground mx-auto mb-10 max-w-3xl text-lg leading-relaxed md:text-xl"
      >
        SmartHire analyzes CVs and job requirements in real time, then ranks candidates with
        transparent AI scoring so your team can hire faster and with more confidence.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: HEADLINE_DELAY + 0.4,
          duration: shouldReduceMotion ? 0.1 : 0.45,
        }}
        className="flex flex-wrap items-center justify-center gap-4"
      >
        <motion.div
          whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        >
          <Button size="lg" className="h-12 rounded-md px-7 text-base" onClick={onRecruiterCta}>
            For Recruiters
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </motion.div>
        <motion.div
          whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        >
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-md px-7 text-base"
            onClick={onCandidateCta}
          >
            For Candidates
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
})
