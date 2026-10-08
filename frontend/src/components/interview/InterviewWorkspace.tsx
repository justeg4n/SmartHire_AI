/**
 * InterviewWorkspace
 *
 * Full-screen interview environment for candidates.
 *
 * Layout (three-column):
 *  ┌─────────────┬────────────────────────┬──────────────┐
 *  │  LeftPanel  │      CenterPanel       │  RightPanel  │
 *  │  25 % min   │  flex-1 (remaining)    │  20 % min    │
 *  │  300 px     │  500 px min-width      │  280 px      │
 *  └─────────────┴────────────────────────┴──────────────┘
 *
 * Props (`InterviewWorkspaceProps`):
 *  - `skipPermissions` – skip the modal gate (useful in E2E tests)
 *  - `onSessionEnd`    – called when the session ends (reserved for future use)
 */

import React, { useCallback, lazy, Suspense, useState } from 'react'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme'
import { PermissionsModal } from './PermissionsModal'
import { EndInterviewModal } from './EndInterviewModal'
import { useMediaDevices } from './hooks/useMediaDevices'
import { useSpeechTranscript } from './hooks/useSpeechTranscript'
import { useSessionRecorder } from './hooks/useSessionRecorder'
import type { InterviewWorkspaceProps } from './types'

const LeftPanel = lazy(() => import('./LeftPanel').then((m) => ({ default: m.LeftPanel })))
const CenterPanel = lazy(() => import('./CenterPanel').then((m) => ({ default: m.CenterPanel })))
const RightPanel = lazy(() => import('./RightPanel').then((m) => ({ default: m.RightPanel })))

// sessionId từ URL param ?code=xxx
const SESSION_ID = new URLSearchParams(window.location.search).get('code') ?? 'unknown'

const PanelSkeleton = () => <div className="bg-muted/20 h-full w-full animate-pulse rounded-lg" />

export const InterviewWorkspace: React.FC<InterviewWorkspaceProps> = ({
  skipPermissions = false,
}) => {
  const { resolvedTheme } = useTheme()
  const [showEndModal, setShowEndModal] = useState(false)

  const {
    stream,
    isMicMuted,
    isCameraOff,
    permissionsGranted,
    requestPermissions,
    toggleMic,
    toggleCamera,
    stopAll,
  } = useMediaDevices()

  const { transcript, isListening } = useSpeechTranscript(stream)
  const { uploadStatus, duration, startRecording, stopAndUpload } = useSessionRecorder()

  const isReady = skipPermissions || permissionsGranted

  // Start recording ngay khi stream sẵn sàng
  const handleGrant = useCallback(async () => {
    await requestPermissions()
  }, [requestPermissions])

  // Stream sẵn → start recording
  React.useEffect(() => {
    if (stream && isReady) startRecording(stream)
  }, [stream, isReady, startRecording])

  // ── Xử lý End Interview ────────────────────────────────────────────────
  const handleEndConfirm = useCallback(async () => {
    await stopAndUpload(SESSION_ID, transcript)
    stopAll() // stop webcam sau khi upload xong
  }, [stopAndUpload, transcript, stopAll])

  const handleEndCancel = useCallback(() => {
    if (uploadStatus === 'done') {
      // Redirect về trang chủ sau khi upload xong
      window.location.href = '/'
    } else {
      setShowEndModal(false)
    }
  }, [uploadStatus])

  return (
    <div
      className="bg-background text-foreground h-screen w-full overflow-hidden font-sans"
      role="main"
    >
      {!isReady && <PermissionsModal onPermissionsGranted={handleGrant} />}

      <div
        className={cn(
          'flex h-full w-full transition-opacity duration-500',
          isReady ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!isReady}
      >
        <Suspense
          fallback={
            <div className="h-full w-1/4 min-w-75">
              <PanelSkeleton />
            </div>
          }
        >
          <div className="h-full w-1/4 min-w-75">
            <LeftPanel transcript={transcript} isListening={isListening} />
          </div>
        </Suspense>

        <Suspense
          fallback={
            <div className="h-full min-w-125 flex-1">
              <PanelSkeleton />
            </div>
          }
        >
          <div className="h-full min-w-125 flex-1">
            <CenterPanel onEndInterview={() => setShowEndModal(true)} />
          </div>
        </Suspense>

        <Suspense
          fallback={
            <div className="h-full w-1/5 min-w-70">
              <PanelSkeleton />
            </div>
          }
        >
          <div className="h-full w-1/5 min-w-70">
            <RightPanel
              mediaStream={stream}
              isMicMuted={isMicMuted}
              isCameraOff={isCameraOff}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
            />
          </div>
        </Suspense>
      </div>

      <EndInterviewModal
        open={showEndModal}
        uploadStatus={uploadStatus}
        duration={duration}
        onConfirm={handleEndConfirm}
        onCancel={handleEndCancel}
      />

      <Toaster theme={resolvedTheme} position="top-right" />
    </div>
  )
}
