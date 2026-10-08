import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FEATURE_ITEMS } from './config'
import type { GuestFeaturesProps } from './types'

export const GuestFeatures = memo(function GuestFeatures({
  items = FEATURE_ITEMS,
}: GuestFeaturesProps) {
  const shouldReduceMotion = useReducedMotion()

  const listVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 280,
        damping: 24,
        duration: shouldReduceMotion ? 0.1 : undefined,
      },
    },
  }

  return (
    <section
      aria-label="Platform features overview"
      id="features"
      className="relative z-10 mt-24 w-full"
    >
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.05 }}
          className="font-display text-foreground text-3xl font-bold tracking-tight lg:text-4xl"
        >
          Built on Cutting-Edge AI
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1 }}
          className="text-muted-foreground mt-4 text-base"
        >
          Our platform combines intelligent CV analysis, smart job matching, and AI-powered insights
          to help you find and hire the right candidates faster.
        </motion.p>
      </div>

      <motion.div
        variants={listVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {items.map(({ id, icon: Icon, title, description }) => (
          <motion.article
            key={id}
            variants={cardVariants}
            whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.015 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
            className="group border-border bg-card hover:bg-accent flex min-h-64 cursor-default flex-col items-start rounded-lg border p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_4px_0_rgba(15,255,224,0.12)]"
          >
            <div className="bg-primary text-primary-foreground mb-6 flex h-11 w-11 items-center justify-center rounded-md transition-all duration-300 group-hover:shadow-[0_0_16px_rgba(15,255,224,0.25)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>

            <h3 className="font-display text-card-foreground mb-3 text-xl font-semibold tracking-tight">
              {title}
            </h3>
            <p className="text-muted-foreground text-sm leading-7">{description}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  )
})
