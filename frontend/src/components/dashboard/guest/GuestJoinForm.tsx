/**
 * GuestJoinForm — Neon Protocol
 *
 * Glassmorphic invite-code entry card.
 * Stitch: glass panel (surface-variant 60% opacity + 24px backdrop-blur)
 * Ghost border + glow on focus
 */

import { memo, useCallback, useId, useState } from 'react'
import { ArrowRight, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GuestJoinFormProps } from './types'

export const GuestJoinForm = memo(function GuestJoinForm({ onSubmit }: GuestJoinFormProps) {
  const [inviteCode, setInviteCode] = useState('')
  const inputId = useId()

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInviteCode(e.target.value)
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = inviteCode.trim()
      if (trimmed) onSubmit(trimmed)
    },
    [inviteCode, onSubmit],
  )

  const isSubmitDisabled = !inviteCode.trim()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="w-full max-w-md"
    >
      {/* Glassmorphism panel — Stitch spec: surface-variant 60% + 24px blur */}
      <div className="glass-panel shadow-void relative flex flex-col overflow-hidden rounded-xl border border-[rgba(72,71,79,0.2)] p-8 dark:border-[rgba(15,255,224,0.08)]">
        {/* Glass reflection line */}
        <div
          aria-hidden="true"
          className="via-primary/20 absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        />

        {/* Tech grid overlay (subtle) */}
        <div
          aria-hidden="true"
          className="tech-grid-sm pointer-events-none absolute inset-0 rounded-xl opacity-50"
        />

        {/* Icon + Header */}
        <div className="relative z-10 mb-6">
          <div className="gradient-cta mb-4 flex h-10 w-10 items-center justify-center rounded-lg shadow-[0_0_12px_rgba(15,255,224,0.3)]">
            <Zap className="h-5 w-5 text-[#006659]" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-semibold text-zinc-900 dark:text-[#f5f2fb]">
            Initialize Session
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-[#acaab3]">
            Enter your organisation's authorisation code to begin.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative z-10 flex flex-col gap-5"
          noValidate
          aria-label="Join interview session"
        >
          {/* Code input */}
          <div className="space-y-2">
            <label
              htmlFor={inputId}
              className="ml-0.5 text-xs font-semibold tracking-widest text-zinc-700 uppercase dark:text-[#acaab3]"
            >
              Authorisation Code
            </label>
            <Input
              id={inputId}
              autoComplete="off"
              autoFocus
              placeholder="ENTER INVITE CODE"
              className="dark:focus-visible:border-primary dark:focus-visible:ring-primary/20 h-12 rounded-lg text-center text-base tracking-widest uppercase dark:border-[rgba(72,71,79,0.3)] dark:bg-[#1f1f27] dark:placeholder:text-[#76747d]"
              value={inviteCode}
              onChange={handleChange}
            />
          </div>

          {/* Submit — Gradient CTA */}
          <Button
            type="submit"
            disabled={isSubmitDisabled}
            aria-disabled={isSubmitDisabled}
            className="group gradient-cta h-12 w-full rounded-lg text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Initialize Environment
            <ArrowRight
              className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Button>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(72,71,79,0.3)]" />
            <span className="text-xs text-zinc-500 dark:text-[#76747d]">or</span>
            <div className="h-px flex-1 bg-[rgba(72,71,79,0.3)]" />
          </div>

          {/* Secondary action */}
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-lg text-sm"
            onClick={() => (window.location.href = '/register')}
          >
            Create Candidate Account
          </Button>
        </form>
      </div>
    </motion.div>
  )
})
