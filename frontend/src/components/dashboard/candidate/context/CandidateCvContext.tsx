import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { list } from 'aws-amplify/storage'

import { useAppSyncSubscription } from '@/hooks/useAppSyncSubscription'
import {
  fetchCandidateCvStatusQuery,
  type CandidateCvStatusSnapshot,
} from '@/lib/fetchCandidateCvStatusQuery'
import { fetchJobSuggestionsStatusSnapshot } from '@/lib/fetchJobSuggestionsQuery'
import { ON_JOB_SUGGESTIONS, type JobSuggestionsResponse } from '@/lib/appSyncOperations'
import { useAuthStore } from '@/store/authStore'

export const cvReadyStorageKey = (userId: string) => `smarthire_cv_ready_${userId}`
/** Legacy: last uploaded object path (any folder). */
export const cvLastKeyStorageKey = (userId: string) => `smarthire_cv_last_key_${userId}`
/** Preferred storage key for general CV S3 path. */
export const cvGeneralPathKey = (userId: string) => `smarthire_cv_path_general_${userId}`
export const cvJobPathKey = (userId: string, jobId: string) =>
  `smarthire_cv_path_job_${userId}_${jobId}`

type ListItem = { path: string; lastModified?: Date }

/** Latest PDF (or any file) under an S3 prefix via Amplify Storage list. */
export async function listLatestCvPdfUnderPrefix(prefix: string): Promise<string | null> {
  try {
    const out = await list({
      path: prefix,
      options: { listAll: true },
    })
    const items = ('items' in out && Array.isArray(out.items) ? out.items : []) as ListItem[]
    if (items.length === 0) return null
    const pdfs = items.filter((i) => i.path?.toLowerCase().endsWith('.pdf'))
    const pool = pdfs.length > 0 ? pdfs : items
    pool.sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
    return pool[0]?.path ?? null
  } catch {
    return null
  }
}

type CandidateCvContextValue = {
  /**
   * True when DynamoDB has JOB_SUGGESTIONS for this user (job_suggestion_engine finished).
   */
  cvReady: boolean
  /**
   * True while matcher output is not ready: after upload, or CV# row exists without JOB_SUGGESTIONS yet.
   */
  pipelinePending: boolean
  isChecking: boolean
  cvStatus: CandidateCvStatusSnapshot | null
  /** Resolved S3 path for general CV (`candidates/<sub>/general/...`), if any. */
  storedGeneralCvPath: string | null
  refreshCvStatus: () => Promise<void>
  /** After S3 upload succeeds; snapshots server JOB_SUGGESTIONS.updatedAt as baseline for re-upload. */
  markCvUploaded: (lastObjectPath: string) => Promise<void>
}

const CandidateCvContext = createContext<CandidateCvContextValue | null>(null)
const candidateCvContextFallback: CandidateCvContextValue = {
  cvReady: false,
  pipelinePending: false,
  isChecking: false,
  cvStatus: null,
  storedGeneralCvPath: null,
  refreshCvStatus: async () => {},
  markCvUploaded: async () => {},
}

export function CandidateCvProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  const [cvReady, setCvReady] = useState(false)
  const [pipelinePending, setPipelinePending] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [cvStatus, setCvStatus] = useState<CandidateCvStatusSnapshot | null>(null)
  const [storedGeneralCvPath, setStoredGeneralCvPath] = useState<string | null>(null)
  /** Waiting for a new job_suggestion_engine run after upload. */
  const awaitingMatcherRef = useRef(false)
  /** Last accepted JOB_SUGGESTIONS.updatedAt from Dynamo (server). */
  const lastSeenJobSuggestionsUpdatedAtRef = useRef<string | null>(null)
  /** Snapshot of updatedAt at upload start — fresh row must differ (re-upload). Null = first-ever suggestions OK. */
  const preWaitBaselineUpdatedAtRef = useRef<string | null>(null)

  const runCheck = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = opts?.quiet === true
      if (!userId) {
        awaitingMatcherRef.current = false
        preWaitBaselineUpdatedAtRef.current = null
        lastSeenJobSuggestionsUpdatedAtRef.current = null
        setCvReady(false)
        setPipelinePending(false)
        setCvStatus(null)
        setStoredGeneralCvPath(null)
        setIsChecking(false)
        return
      }

      if (!quiet) setIsChecking(true)
      const id = userId
      let hasSuggestionsRecord = false
      let suggestionsUpdatedAt: string | null = null
      let hasCvRow = false
      let cvStatusSnapshot: CandidateCvStatusSnapshot | null = null

      try {
        const snap = await fetchJobSuggestionsStatusSnapshot(id)
        hasSuggestionsRecord = snap.hasRecord
        suggestionsUpdatedAt = snap.updatedAt
        if (hasSuggestionsRecord && typeof localStorage !== 'undefined') {
          localStorage.setItem(cvReadyStorageKey(id), '1')
        }

        cvStatusSnapshot = await fetchCandidateCvStatusQuery(id)
        hasCvRow = cvStatusSnapshot.hasCv
      } catch (err) {
        console.warn('[CandidateCv] status check failed:', err)
        try {
          cvStatusSnapshot = await fetchCandidateCvStatusQuery(id)
          hasCvRow = cvStatusSnapshot.hasCv
        } catch {
          hasCvRow = false
          cvStatusSnapshot = null
        }
      }
      setCvStatus(cvStatusSnapshot)

      if (hasSuggestionsRecord) {
        const waiting = awaitingMatcherRef.current
        const baseline = preWaitBaselineUpdatedAtRef.current
        /**
         * Do not use client clock vs server updatedAt (skew breaks completion).
         * While waiting after upload: accept only a new Dynamo write (updatedAt !== baseline), or any row if baseline was null (first suggestions).
         */
        const recordFresh =
          !waiting || !suggestionsUpdatedAt || baseline == null || suggestionsUpdatedAt !== baseline

        console.info('[CandidateCv] runCheck suggestions:', {
          candidateId: id,
          waiting,
          baselineUpdatedAt: baseline,
          suggestionsUpdatedAt,
          recordFresh,
        })

        if (recordFresh) {
          awaitingMatcherRef.current = false
          preWaitBaselineUpdatedAtRef.current = null
          lastSeenJobSuggestionsUpdatedAtRef.current = suggestionsUpdatedAt ?? null
          setCvReady(true)
          setPipelinePending(false)
        } else {
          setCvReady(false)
          setPipelinePending(true)
        }
      } else {
        setCvReady(false)
        /**
         * Avoid infinite "waiting" when previous pipeline runs failed and no JOB_SUGGESTIONS
         * record exists. We only show pending while the current client session is explicitly
         * waiting for a matcher run triggered by a fresh upload.
         */
        setPipelinePending(awaitingMatcherRef.current)
      }

      let generalPath: string | null = null
      if (hasSuggestionsRecord || hasCvRow || awaitingMatcherRef.current) {
        if (typeof localStorage !== 'undefined') {
          generalPath = localStorage.getItem(cvGeneralPathKey(id))
          if (!generalPath) {
            const legacy = localStorage.getItem(cvLastKeyStorageKey(id))
            if (legacy?.includes('/general/')) {
              generalPath = legacy
              localStorage.setItem(cvGeneralPathKey(id), legacy)
            }
          }
        }
        if (!generalPath) {
          generalPath = await listLatestCvPdfUnderPrefix(`candidates/${id}/general/`)
          if (generalPath && typeof localStorage !== 'undefined') {
            localStorage.setItem(cvGeneralPathKey(id), generalPath)
          }
        }
      }
      setStoredGeneralCvPath(generalPath)

      if (!quiet) setIsChecking(false)
    },
    [userId],
  )

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runCheck()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [runCheck])

  /**
   * Subscribe whenever pipeline is pending — including re-upload while cvReady was still true
   * (previous bug: !cvReady && pipelinePending never became true for subscription).
   */
  const watchMatcher = Boolean(userId && pipelinePending)

  const onMatcherSubError = useCallback((err: Error) => {
    console.warn('[CandidateCv] onJobSuggestions subscription:', err.message)
  }, [])

  const { data: matcherSubData } = useAppSyncSubscription<JobSuggestionsResponse>(
    ON_JOB_SUGGESTIONS,
    { candidateId: userId || '' },
    { skip: !watchMatcher, onError: onMatcherSubError },
  )

  useEffect(() => {
    if (!watchMatcher || !userId) return
    console.info('[CandidateCv] subscription active for candidate:', userId)
  }, [watchMatcher, userId])

  useEffect(() => {
    if (!watchMatcher || !userId) return
    const payload = matcherSubData?.onJobSuggestions
    if (!payload || payload.candidateId !== userId) return
    console.info('[CandidateCv] subscription payload received:', {
      candidateId: payload.candidateId,
      updatedAt: payload.updatedAt,
      suggestionCount: payload.suggestionCount,
    })
    const t = window.setTimeout(() => {
      void runCheck({ quiet: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [watchMatcher, userId, matcherSubData, runCheck])

  // Polling disabled temporarily to test pure AppSync subscription behavior.

  useEffect(() => {
    if (!userId || !pipelinePending) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void runCheck({ quiet: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, pipelinePending, runCheck])

  useEffect(() => {
    if (!userId || !pipelinePending) return
    // Safety net when subscription delivery is delayed/misconfigured.
    const interval = window.setInterval(() => {
      void runCheck({ quiet: true })
    }, 15000)
    return () => window.clearInterval(interval)
  }, [userId, pipelinePending, runCheck])

  const markCvUploaded = useCallback(
    async (lastObjectPath: string) => {
      if (!userId) return
      /**
       * Read current Dynamo JOB_SUGGESTIONS.updatedAt *before* waiting — fixes:
       * - Re-upload while lastSeen ref not hydrated yet (baseline was null → old row treated as "fresh").
       * - Stale UI: we clear cvReady so JobSuggestions unmounts until new updatedAt arrives.
       */
      try {
        const snap = await fetchJobSuggestionsStatusSnapshot(userId)
        preWaitBaselineUpdatedAtRef.current = snap.hasRecord ? snap.updatedAt : null
        if (snap.hasRecord && snap.updatedAt) {
          lastSeenJobSuggestionsUpdatedAtRef.current = snap.updatedAt
        }
      } catch {
        preWaitBaselineUpdatedAtRef.current = lastSeenJobSuggestionsUpdatedAtRef.current
      }
      awaitingMatcherRef.current = true
      setCvReady(false)
      setPipelinePending(true)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cvLastKeyStorageKey(userId), lastObjectPath)
        if (lastObjectPath.includes('/general/')) {
          localStorage.setItem(cvGeneralPathKey(userId), lastObjectPath)
          setStoredGeneralCvPath(lastObjectPath)
        } else {
          const segments = lastObjectPath.split('/').filter(Boolean)
          if (segments.length >= 4 && segments[0] === 'candidates' && segments[1] === userId) {
            const jobSeg = segments[2]
            if (jobSeg && jobSeg !== 'general') {
              localStorage.setItem(cvJobPathKey(userId, jobSeg), lastObjectPath)
            }
          }
        }
      }
    },
    [userId],
  )

  const refreshCvStatus = useCallback(() => runCheck({ quiet: true }), [runCheck])

  const value = useMemo(
    () => ({
      cvReady,
      pipelinePending,
      isChecking,
      cvStatus,
      storedGeneralCvPath,
      refreshCvStatus,
      markCvUploaded,
    }),
    [
      cvReady,
      pipelinePending,
      isChecking,
      cvStatus,
      storedGeneralCvPath,
      refreshCvStatus,
      markCvUploaded,
    ],
  )

  return <CandidateCvContext.Provider value={value}>{children}</CandidateCvContext.Provider>
}

export function useCandidateCv() {
  const ctx = useContext(CandidateCvContext)
  if (!ctx) {
    console.warn('useCandidateCv mounted without CandidateCvProvider; returning safe fallback state.')
    return candidateCvContextFallback
  }
  return ctx
}
