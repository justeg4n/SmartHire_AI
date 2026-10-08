import { memo } from 'react'
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/button'

type GuestClosingCtaProps = {
  onStart: () => void
}

export const GuestClosingCta = memo(function GuestClosingCta({ onStart }: GuestClosingCtaProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section
      aria-label="Get started"
      className="bg-surface-low relative z-10 mx-auto mt-24 w-full max-w-6xl rounded-2xl px-6 py-16 text-center"
    >
      <div className="tech-grid pointer-events-none absolute inset-0 opacity-[0.03]" />
      <motion.h2
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.35 }}
        className="font-display text-foreground relative text-4xl font-bold tracking-tight md:text-5xl"
      >
        Ready to Transform Your Hiring?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{
          delay: shouldReduceMotion ? 0 : 0.08,
          duration: shouldReduceMotion ? 0.1 : 0.35,
        }}
        className="text-muted-foreground relative mx-auto mt-4 max-w-2xl text-lg"
      >
        Launch intelligent recruitment workflows in minutes and start shortlisting with confidence.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{
          delay: shouldReduceMotion ? 0 : 0.12,
          duration: shouldReduceMotion ? 0.1 : 0.35,
        }}
        className="relative mt-8"
        whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      >
        <Button
          size="lg"
          className="h-12 rounded-md px-8 text-base shadow-sm hover:shadow-md"
          onClick={onStart}
        >
          Start Hiring Smarter
          <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </motion.div>
    </section>
  )
})
