import React, { memo, useEffect, useRef } from 'react'
import { Mic, Loader2, Volume2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAIState } from './hooks/useAIState'
import { DEFAULT_TRANSCRIPT } from './config'
import type { AIState, LeftPanelProps, TranscriptMessage } from './types'

// ---------------------------------------------------------------------------
// AI Avatar
// ---------------------------------------------------------------------------

const AI_STATE_CONFIG: Record<
  AIState,
  { icon: React.ReactNode; label: string; ringClass: string; textClass: string }
> = {
  listening: {
    icon: <Mic className="h-10 w-10 animate-pulse text-emerald-500" aria-hidden="true" />,
    label: 'Listening…',
    ringClass: 'animate-ping border border-emerald-500/30',
    textClass: 'text-emerald-500',
  },
  thinking: {
    icon: <Loader2 className="h-10 w-10 animate-spin text-orange-500" aria-hidden="true" />,
    label: 'Thinking…',
    ringClass: '',
    textClass: 'text-orange-500',
  },
  speaking: {
    icon: <Volume2 className="h-10 w-10 text-teal-400" aria-hidden="true" />,
    label: 'Speaking…',
    ringClass: 'scale-150 animate-pulse bg-teal-400/20',
    textClass: 'text-teal-400',
  },
}

const AIAvatar = memo(function AIAvatar({ state }: { state: AIState }) {
  const { icon, label, ringClass, textClass } = AI_STATE_CONFIG[state]
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div
          className="border-border bg-muted relative z-10 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2"
          role="img"
          aria-label={`AI interviewer is ${label}`}
        >
          {icon}
        </div>
        {ringClass && (
          <div className={cn('absolute inset-0 rounded-full', ringClass)} aria-hidden="true" />
        )}
      </div>
      <div className="text-center">
        <p className="text-foreground text-lg font-bold">SmartHire AI</p>
        <p
          className={cn('mt-1 text-sm font-medium tracking-wider uppercase', textClass)}
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </p>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Transcript message row
// ---------------------------------------------------------------------------

const MessageBubble = memo(function MessageBubble({ msg }: { msg: TranscriptMessage }) {
  const isUser = msg.sender === 'user'
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <span
        className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wider uppercase"
        aria-hidden="true"
      >
        {isUser ? 'You' : 'AI'}
      </span>
      <div
        className={cn(
          'max-w-[90%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-muted text-foreground/80 rounded-tr-sm'
            : 'rounded-tl-sm border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-100',
        )}
      >
        {msg.text}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export const LeftPanel: React.FC<LeftPanelProps> = ({
  aiState: controlledState,
  transcript = DEFAULT_TRANSCRIPT,
}) => {
  // Use controlled state when supplied; fall back to the cycling mock.
  const { aiState, setAIState } = useAIState({ enabled: controlledState === undefined })
  const activeState = controlledState ?? aiState

  // Keep setAIState available if the parent switches to controlled mode later.
  void setAIState

  // Auto-scroll to the latest transcript message.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  return (
    <div
      className="border-border bg-background/50 flex h-full flex-col gap-4 border-r p-4"
      aria-label="AI interviewer panel"
    >
      {/* AI Presence & State */}
      <Card className="border-border bg-card/50 flex h-1/3 items-center justify-center p-6">
        <AIAvatar state={activeState} />
      </Card>

      {/* Live Transcript */}
      <Card className="border-border bg-card/30 flex flex-1 flex-col overflow-hidden">
        <div className="border-border bg-card/80 border-b p-3">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Live Transcript
          </h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div
            className="flex flex-col gap-4"
            role="log"
            aria-label="Interview transcript"
            aria-live="polite"
          >
            {transcript.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {/* Invisible anchor for auto-scroll */}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </ScrollArea>
      </Card>
    </div>
  )
}
