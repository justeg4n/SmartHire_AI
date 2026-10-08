import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PIPELINE_FLOWS } from './config'

export const GuestPipeline = memo(function GuestPipeline() {
  const shouldReduceMotion = useReducedMotion()

  const flowsVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.14,
        delayChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  }

  const flowCardVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 260,
        damping: 24,
        duration: shouldReduceMotion ? 0.1 : undefined,
      },
    },
  }

  const stepsVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  }

  const stepItemVariants = {
    hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -8 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: shouldReduceMotion ? 0.1 : 0.26 },
    },
  }

  return (
    <section
      aria-label="Unified processing pipeline"
      className="bg-surface-low relative z-10 mt-24 w-full rounded-none px-4 py-16 md:px-10"
    >
      <div className="tech-grid pointer-events-none absolute inset-0 opacity-5" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-foreground text-3xl font-bold tracking-tight md:text-4xl"
          >
            How It Works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="text-muted-foreground mt-4 text-base"
          >
            SmartHire simplifies hiring by connecting the right people with the right opportunities,
            all powered by intelligent matching algorithms.
          </motion.p>
        </div>

        <motion.div
          variants={flowsVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {PIPELINE_FLOWS.map((flow) => (
            <motion.article
              key={flow.id}
              variants={flowCardVariants}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              className="border-border bg-card flex min-h-80 flex-col rounded-lg border p-6"
            >
              <h3 className="font-display text-primary mb-6 text-2xl font-bold tracking-tight">
                {flow.title}
              </h3>
              <motion.ul
                variants={stepsVariants}
                initial="hidden"
                animate="visible"
                className="space-y-4"
              >
                {flow.steps.map((step) => (
                  <motion.li
                    variants={stepItemVariants}
                    key={step}
                    className="text-muted-foreground flex items-start gap-3 text-sm leading-6"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-primary mt-1 h-2 w-2 shrink-0 rounded-full"
                    />
                    <span>{step}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
})
