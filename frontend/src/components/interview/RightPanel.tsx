import React, { memo, useEffect, useRef } from 'react'
import { Wifi, WifiOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useEmotionAnalysis } from './hooks/useEmotionAnalysis'
import { useMicVolume } from './hooks/useMicVolume'
import { EMOTION_BAR_COLOR, EMOTION_COLOR } from './config'
import type { RightPanelProps } from './types'

// ── Connection badge ──────────────────────────────────────────────────────────
const ConnectionBadge = memo(({ connected }: { connected: boolean }) => (
  <Badge
    variant="outline"
    className={cn(
      'flex items-center gap-2 px-3 py-1 transition-colors duration-300',
      connected
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        : 'border-red-500/30 bg-red-500/10 text-red-400',
    )}
  >
    {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
    {connected ? 'Connected' : 'Reconnecting…'}
  </Badge>
))

// ── Camera feed ───────────────────────────────────────────────────────────────
const CameraFeed = memo(({ stream }: { stream: MediaStream | null }) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream ?? null
    // Quan trọng: play lại sau khi set srcObject mới
    if (stream) {
      video.play().catch(() => {})
    }
    return () => {
      if (video) video.srcObject = null
    }
  }, [stream])

  return (
    <div className="border-border bg-card relative aspect-video overflow-hidden rounded-lg border shadow-lg">
      {stream ? (
        <video
          key={stream.id} // ← force re-mount khi stream object đổi
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
      ) : (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2">
          <VideoOff className="h-8 w-8 opacity-40" />
          <span className="text-xs">Camera Off</span>
        </div>
      )}
    </div>
  )
})

// ── Mic Volume Visualizer ─────────────────────────────────────────────────────
const MicVisualizer = memo(({ volume, isMuted }: { volume: number; isMuted: boolean }) => {
  const bars = 5
  const isTalking = volume > 12 && !isMuted

  return (
    <div className="flex h-6 items-end justify-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) * (100 / bars)
        const active = isTalking && volume >= threshold * 0.6
        const height = active ? Math.max(4, (volume / 100) * 24 * (1 - Math.abs(i - 2) * 0.15)) : 4
        return (
          <div
            key={i}
            className={cn(
              'w-1.5 rounded-full transition-all duration-75',
              active ? 'bg-emerald-400' : 'bg-muted',
            )}
            style={{ height: `${height}px` }}
          />
        )
      })}
    </div>
  )
})

// ── Panel ─────────────────────────────────────────────────────────────────────
export const RightPanel: React.FC<RightPanelProps> = ({
  mediaStream,
  isMicMuted,
  isCameraOff,
  onToggleMic,
  onToggleCamera,
}) => {
  const { snapshot, isConnected } = useEmotionAnalysis()
  const { label, score } = snapshot
  const micVolume = useMicVolume(mediaStream, isMicMuted)
  const isTalking = micVolume > 12 && !isMicMuted

  return (
    <div className="bg-background/50 flex h-full flex-col gap-4 p-4">
      {/* Network status */}
      <div className="flex justify-end">
        <ConnectionBadge connected={isConnected} />
      </div>

      {/* Camera */}
      <CameraFeed stream={isCameraOff ? null : mediaStream} />

      {/* ── Mic + Camera Controls ── */}
      <Card className="border-border bg-card/40 flex flex-col items-center gap-3 p-4">
        {/* Mic visualizer bars */}
        <MicVisualizer volume={micVolume} isMuted={isMicMuted} />

        {/* Talking indicator text */}
        <p
          className={cn(
            'text-[11px] font-medium tracking-wider uppercase transition-colors duration-200',
            isMicMuted
              ? 'text-red-400'
              : isTalking
                ? 'animate-pulse text-emerald-400'
                : 'text-muted-foreground',
          )}
        >
          {isMicMuted ? 'Muted' : isTalking ? 'Speaking…' : 'Listening'}
        </p>

        {/* Toggle buttons */}
        <div className="flex gap-4">
          {/* Mic button */}
          <button
            onClick={onToggleMic}
            aria-label={isMicMuted ? 'Unmute' : 'Mute'}
            className={cn(
              'relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200',
              isMicMuted
                ? 'border-red-500 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'border-emerald-500 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
            )}
          >
            {/* Ring pulse khi đang nói */}
            {isTalking && (
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-400 opacity-40" />
            )}
            {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Camera button */}
          <button
            onClick={onToggleCamera}
            aria-label={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200',
              isCameraOff
                ? 'border-red-500 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'border-emerald-500 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
            )}
          >
            {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </button>
        </div>

        {/* Label */}
        <div className="text-muted-foreground flex gap-6 text-xs">
          <span className={isMicMuted ? 'text-red-400' : 'text-emerald-400'}>
            {isMicMuted ? 'Mic Off' : 'Mic On'}
          </span>
          <span className={isCameraOff ? 'text-red-400' : 'text-emerald-400'}>
            {isCameraOff ? 'Cam Off' : 'Cam On'}
          </span>
        </div>
      </Card>

      {/* Emotion widget — giữ nguyên */}
      <Card className="border-border bg-card/40 flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground/70 text-sm font-semibold">Real-time Analysis</h3>
          <span className="text-muted-foreground text-xs">Live</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-muted-foreground mb-1 text-xs tracking-wider uppercase">State</p>
            <p
              className={cn(
                'text-xl font-bold transition-colors duration-500',
                EMOTION_COLOR[label],
              )}
            >
              {label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground mb-1 text-xs tracking-wider uppercase">
              Confidence
            </p>
            <p className="text-foreground text-2xl font-light">{score}%</p>
          </div>
        </div>
        <div
          className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              'h-full transition-all duration-1000 ease-in-out',
              EMOTION_BAR_COLOR[label],
            )}
            style={{ width: `${score}%` }}
          />
        </div>
      </Card>

      {/* Footer */}
      <div className="mt-auto">
        <Badge
          variant="outline"
          className="border-border text-muted-foreground w-full justify-center py-2"
        >
          Interview in Progress
        </Badge>
      </div>
    </div>
  )
}
