import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { UploadCloud, File, AlertCircle, Loader2, X, FileText } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { uploadData, getUrl, type GetUrlWithPathOutput } from 'aws-amplify/storage'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/ui/badge'

import {
  cvJobPathKey,
  listLatestCvPdfUnderPrefix,
  useCandidateCv,
} from '../context/CandidateCvContext'

const CV_GET_URL_OPTIONS = { expiresIn: 3600 } as const

async function getCvPresignedUrl(path: string): Promise<GetUrlWithPathOutput> {
  return getUrl({
    path,
    options: { expiresIn: CV_GET_URL_OPTIONS.expiresIn },
  })
}

export function CVUploadWidget({
  jobId,
  onUploadComplete,
}: {
  jobId?: string
  /** Called after file is successfully uploaded to S3. */
  onUploadComplete?: () => void
}) {
  const user = useAuthStore((state) => state.user)
  const { markCvUploaded, refreshCvStatus, storedGeneralCvPath, cvReady, pipelinePending } =
    useCandidateCv()
  const pipelineCompleteHandledRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [replaceMode, setReplaceMode] = useState(false)
  const [jobScopedPath, setJobScopedPath] = useState<string | null>(null)
  const [loadingJobPath, setLoadingJobPath] = useState(false)

  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'processing' | 'success' | 'error'
  >('idle')
  const [progress, setProgress] = useState(0)
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null)
  const [remotePreviewError, setRemotePreviewError] = useState(false)
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null)

  const finalizePipelineComplete = useCallback(async () => {
    if (pipelineCompleteHandledRef.current) return
    pipelineCompleteHandledRef.current = true
    setUploadStatus('idle')
    setFile(null)
    setReplaceMode(false)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    await refreshCvStatus()
    toast.success('CV analyzed. Your job recommendations are ready.')
  }, [refreshCvStatus])

  /** Matcher completion is driven by AppSync + context runCheck; close local UI when pipeline is done. */
  useEffect(() => {
    if (uploadStatus !== 'processing') return
    if (cvReady && !pipelinePending) {
      void finalizePipelineComplete()
    }
  }, [uploadStatus, cvReady, pipelinePending, finalizePipelineComplete])

  useEffect(() => {
    if (uploadStatus !== 'processing') return
    const warn = window.setTimeout(() => {
      toast.message('Still analyzing…', {
        description:
          'Large queues can slow matching. You can leave this page open or refresh in a few minutes.',
      })
    }, 120_000)
    return () => window.clearTimeout(warn)
  }, [uploadStatus])

  const existingS3Path = jobId ? jobScopedPath : storedGeneralCvPath
  const showSavedCvViewer = Boolean(existingS3Path && !file && !replaceMode && !loadingJobPath)
  const showUploader = Boolean(!existingS3Path || replaceMode || file || loadingJobPath)

  useEffect(() => {
    if (!user?.id || !jobId) {
      setJobScopedPath(null)
      setLoadingJobPath(false)
      return undefined
    }
    let cancelled = false
    setLoadingJobPath(true)
    ;(async () => {
      try {
        const fromLs =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(cvJobPathKey(user.id, jobId))
            : null
        if (fromLs) {
          if (!cancelled) setJobScopedPath(fromLs)
          return
        }
        const p = await listLatestCvPdfUnderPrefix(`candidates/${user.id}/${jobId}/`)
        if (!cancelled) {
          setJobScopedPath(p)
          if (p && typeof localStorage !== 'undefined') {
            localStorage.setItem(cvJobPathKey(user.id, jobId), p)
          }
        }
      } finally {
        if (!cancelled) setLoadingJobPath(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, jobId])

  useEffect(() => {
    if (!file) {
      setLocalPdfUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setLocalPdfUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    if (file) return undefined
    if (replaceMode) {
      void Promise.resolve().then(() => {
        setRemotePreviewUrl(null)
        setRemotePreviewError(false)
      })
      return undefined
    }
    const path = existingS3Path
    if (!path || !user?.id) {
      void Promise.resolve().then(() => {
        setRemotePreviewUrl(null)
        setRemotePreviewError(false)
      })
      return undefined
    }
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setRemotePreviewError(false)
    })
    getCvPresignedUrl(path)
      .then((out) => {
        if (!cancelled) setRemotePreviewUrl(out.url.toString())
      })
      .catch(() => {
        if (!cancelled) {
          setRemotePreviewError(true)
          setRemotePreviewUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [file, replaceMode, existingS3Path, user?.id])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const validateFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed')
      return false
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB')
      return false
    }
    return true
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (validateFile(droppedFile)) {
        setFile(droppedFile)
        setUploadStatus('idle')
        setRemotePreviewError(false)
      }
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      if (validateFile(selectedFile)) {
        setFile(selectedFile)
        setUploadStatus('idle')
        setRemotePreviewError(false)
      }
    }
  }

  const clearFile = () => {
    setFile(null)
    setUploadStatus('idle')
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const pdfSrc = remotePreviewUrl ?? localPdfUrl
  const previewSource = remotePreviewUrl ? 's3' : localPdfUrl ? 'local' : null

  const handleUpload = async () => {
    if (!file || !user) return

    try {
      pipelineCompleteHandledRef.current = false
      setUploadStatus('uploading')
      setProgress(0)

      const targetJob = jobId || 'general'
      const key = `candidates/${user.id}/${targetJob}/${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

      const uploadTask = uploadData({
        path: key,
        data: file,
        options: {
          onProgress: (progressData) => {
            const { transferredBytes, totalBytes } = progressData
            if (totalBytes) {
              const p = Math.round((transferredBytes / totalBytes) * 100)
              setProgress(p)
            }
          },
        },
      })

      await uploadTask.result

      setProgress(100)
      await markCvUploaded(key)
      onUploadComplete?.()
      if (jobId) {
        setJobScopedPath(key)
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cvJobPathKey(user.id, jobId), key)
        }
      }

      try {
        const { url } = await getCvPresignedUrl(key)
        setRemotePreviewUrl(url.toString())
        setRemotePreviewError(false)
      } catch {
        setRemotePreviewError(true)
      }

      setUploadStatus('processing')
      toast.success('CV uploaded. Analyzing and matching jobs…')
    } catch (error) {
      console.error('Upload Error:', error)
      setUploadStatus('error')
      toast.error('Failed to upload CV. Please try again.')
    }
  }

  const cardTitle = showSavedCvViewer
    ? jobId
      ? 'CV on file for this role'
      : 'Your resume on file'
    : 'Upload Resume'

  const cardDescription = showSavedCvViewer
    ? 'This PDF is loaded from your private S3 folder. Replace it anytime with a new file.'
    : jobId
      ? 'Upload your customized CV for the selected role.'
      : 'Select a job first to specifically apply, or upload a general CV.'

  return (
    <Card className="group border-border/70 bg-card/95 relative overflow-hidden border shadow-sm backdrop-blur-xl">
      <div className="from-primary/10 pointer-events-none absolute inset-0 rounded-xl bg-linear-to-br via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <CardHeader className="relative z-10">
        <CardTitle className="flex items-center gap-2">
          {showSavedCvViewer ? <FileText className="text-primary h-5 w-5 shrink-0" /> : null}
          <span>{cardTitle}</span>
          {uploadStatus === 'processing' && (
            <Badge variant="outline" className="border-primary/60 text-primary animate-pulse">
              Analyzing...
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        {loadingJobPath && jobId ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved CV…
          </div>
        ) : null}

        {showSavedCvViewer && !pdfSrc && !remotePreviewError ? (
          <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing preview…
          </div>
        ) : null}

        {showSavedCvViewer && (pdfSrc || remotePreviewError) ? (
          <div className="space-y-3">
            {pdfSrc ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Preview (S3)
                  </p>
                  <a
                    href={pdfSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
                <p className="text-muted-foreground text-xs">
                  Loaded via signed S3 URL — your current uploaded document.
                </p>
                <div className="border-border/60 bg-muted/40 overflow-hidden rounded-lg border">
                  <iframe
                    title="Saved CV PDF preview"
                    src={pdfSrc}
                    className="h-[min(560px,70vh)] w-full border-0"
                  />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                Could not load a signed URL for this file. Check IAM (s3:GetObject) for your prefix.
                You can still replace the file below.
              </p>
            )}
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10 w-full sm:w-auto"
              onClick={() => setReplaceMode(true)}
            >
              <UploadCloud className="mr-2 h-4 w-4" />
              Replace with new PDF
            </Button>
          </div>
        ) : null}

        {showUploader && !loadingJobPath ? (
          <>
            {pdfSrc && (file || replaceMode) ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Preview
                  </p>
                  <a
                    href={pdfSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
                {previewSource ? (
                  <p className="text-muted-foreground text-xs">
                    {previewSource === 's3'
                      ? 'Loaded via signed S3 URL (check Network for the object GET).'
                      : 'Local file preview — after upload, the document is served from S3.'}
                  </p>
                ) : null}
                <div className="border-border/60 bg-muted/40 overflow-hidden rounded-lg border">
                  <iframe
                    title="CV PDF preview"
                    src={pdfSrc}
                    className="h-[min(520px,65vh)] w-full border-0"
                  />
                </div>
                {remotePreviewError && localPdfUrl ? (
                  <p className="text-muted-foreground text-xs">
                    Cloud signed URL failed — showing local file only. Ensure IAM allows
                    s3:GetObject for your prefix.
                  </p>
                ) : null}
              </div>
            ) : null}

            {replaceMode && existingS3Path && !file ? (
              <Button
                variant="ghost"
                className="text-muted-foreground -mt-2 mb-2 w-full sm:w-auto"
                onClick={() => setReplaceMode(false)}
              >
                Cancel replace
              </Button>
            ) : null}

            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
                      isDragging
                        ? 'border-primary bg-primary/15 scale-[1.02]'
                        : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'
                    }`}
                  >
                    <div
                      className={`mb-4 rounded-full p-4 transition-colors duration-300 ${isDragging ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                      <UploadCloud className="h-8 w-8" />
                    </div>
                    <p className="text-foreground mb-1 text-sm font-medium">
                      Drag and drop your PDF here
                    </p>
                    <p className="text-muted-foreground mb-4 text-xs">
                      or click to browse your files
                    </p>
                    <Badge
                      variant="secondary"
                      className="border-border bg-muted text-muted-foreground"
                    >
                      Max size: 10MB
                    </Badge>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="application/pdf"
                      className="hidden"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="file-preview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-4"
                >
                  <div className="group border-border/60 bg-muted/50 relative flex items-center overflow-hidden rounded-xl border p-4 shadow-sm backdrop-blur-sm">
                    {uploadStatus === 'uploading' && (
                      <motion.div
                        className="bg-primary absolute bottom-0 left-0 h-1 origin-left"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: progress / 100 }}
                        transition={{ ease: 'easeOut' }}
                        style={{ width: '100%' }}
                      />
                    )}

                    <div className="bg-muted mr-4 rounded-lg p-3 transition-transform group-hover:scale-105">
                      <File className="text-primary h-6 w-6" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm font-medium">{file.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>

                    {uploadStatus === 'idle' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground ml-2 shrink-0 hover:text-red-400"
                        onClick={clearFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : uploadStatus === 'error' ? (
                      <div className="flex items-center">
                        <AlertCircle className="ml-2 h-5 w-5 shrink-0 text-red-500" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground ml-1 shrink-0 hover:text-red-400"
                          onClick={clearFile}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Loader2 className="text-primary ml-2 h-5 w-5 shrink-0 animate-spin" />
                    )}
                  </div>

                  {uploadStatus === 'uploading' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Uploading to Secure Storage</span>
                        <span className="text-primary">{progress}%</span>
                      </div>
                      <Progress value={progress} className="bg-muted [&>div]:bg-primary h-2" />
                    </div>
                  )}

                  {uploadStatus === 'processing' && (
                    <div className="space-y-2">
                      <div className="text-primary flex justify-between text-xs font-medium">
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          AI Parsing in progress...
                        </span>
                      </div>
                      <Progress
                        value={100}
                        className="bg-muted [&>div]:bg-primary h-2 [&>div]:animate-pulse"
                      />
                    </div>
                  )}

                  {uploadStatus === 'error' && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        Upload failed. Please check your connection and ensure the file is a valid
                        PDF.
                      </p>
                    </div>
                  )}

                  {(uploadStatus === 'idle' || uploadStatus === 'error') && (
                    <Button
                      className="gradient-cta text-primary-foreground w-full border-0 font-medium shadow-[0_0_20px_rgba(15,255,224,0.2)] hover:opacity-95"
                      onClick={handleUpload}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Upload & Analyze
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
