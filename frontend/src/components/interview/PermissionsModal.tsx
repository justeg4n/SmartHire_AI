import React, { memo, useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PermissionsModalProps } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied'

// ─────────────────────────────────────────────────────────────────────────────
// Static data — định nghĩa ngoài component, không tạo lại mỗi render
// ─────────────────────────────────────────────────────────────────────────────
const PERMISSION_ROWS = [
  {
    key: 'mic',
    label: 'Microphone',
    description: 'For speaking with the AI interviewer',
    Icon: Mic,
  },
  {
    key: 'cam',
    label: 'Camera',
    description: 'For live emotion and presence analysis',
    Icon: Camera,
  },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// PermissionRow — memo để không re-render khi parent state thay đổi
// ─────────────────────────────────────────────────────────────────────────────
const PermissionRow = memo(function PermissionRow({
  label,
  description,
  Icon,
  granted,
}: {
  label: string
  description: string
  Icon: React.ElementType
  granted: boolean
}) {
  return (
    <div
      role="listitem"
      className={cn(
        'flex items-center gap-4 rounded-md border p-3 transition-colors duration-300',
        granted ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'rounded-full p-2 transition-colors duration-300',
          granted ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {granted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">{description}</p>
      </div>

      {/* Status badge */}
      <span
        className={cn(
          'shrink-0 text-xs font-semibold transition-colors duration-300',
          granted ? 'text-emerald-500' : 'text-muted-foreground/40',
        )}
        aria-label={granted ? `${label} permission granted` : `${label} permission pending`}
      >
        {granted ? 'Granted' : 'Required'}
      </span>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// PermissionsModal
// ─────────────────────────────────────────────────────────────────────────────
export const PermissionsModal: React.FC<PermissionsModalProps> = memo(function PermissionsModal({
  onPermissionsGranted,
}) {
  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<PermissionStatus>('idle')
  const [errorDesc, setErrorDesc] = useState('')

  const isGranted = status === 'granted'
  const isRequesting = status === 'requesting'

  const requestPermissions = useCallback(async () => {
    try {
      setStatus('requesting')
      setErrorDesc('')

      // Gọi getUserMedia để browser hiện prompt — stream thực tế
      // sẽ được quản lý bởi useMediaDevices bên ngoài
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

      setStatus('granted')

      // Đóng modal trước rồi mới gọi callback → smoother UX
      setOpen(false)
      await onPermissionsGranted()
    } catch (err: unknown) {
      setStatus('denied')
      const msg = err instanceof Error ? err.message : ''
      setErrorDesc(msg || 'Failed to access camera and microphone.')
    }
  }, [onPermissionsGranted])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="border-border bg-background text-foreground sm:max-w-md"
        // Không cho đóng modal — bắt buộc phải grant permissions
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="permissions-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="flex items-center gap-1" aria-hidden="true">
              <Camera className="h-5 w-5" />
              <Mic className="h-5 w-5" />
            </div>
            Device Permissions Required
          </DialogTitle>
          <DialogDescription id="permissions-desc" className="text-muted-foreground">
            SmartHire AI needs your camera and microphone to conduct the interview. Your stream is
            processed locally and never stored.
          </DialogDescription>
        </DialogHeader>

        {/* Permission rows */}
        <div className="flex flex-col gap-3 py-4" role="list" aria-label="Required permissions">
          {PERMISSION_ROWS.map(({ key, label, description, Icon }) => (
            <PermissionRow
              key={key}
              label={label}
              description={description}
              Icon={Icon}
              granted={isGranted}
            />
          ))}

          {/* Error alert */}
          {status === 'denied' && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">Permission Denied</p>
                <p className="text-xs text-red-400/80">
                  {errorDesc} — Please allow permissions in your browser settings and refresh the
                  page.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={requestPermissions}
            disabled={isRequesting || isGranted}
            aria-busy={isRequesting}
            className={cn(
              'w-full cursor-pointer font-medium transition-all duration-200',
              isGranted
                ? 'cursor-not-allowed bg-emerald-600 text-white opacity-80'
                : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isRequesting
              ? 'Requesting…'
              : isGranted
                ? 'Permissions Granted ✓'
                : 'Grant Permissions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
