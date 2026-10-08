import { useCallback, useEffect, useMemo, useState, type ChangeEventHandler } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  DollarSign,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import { fetchJobMetadataQuery } from '@/lib/fetchRecruiterAppSyncQuery'
import { triggerRecruiterRankingRefresh } from '@/lib/triggerRecruiterRankingRefresh'
import type { JobMetadataDetail } from '@/lib/appSyncOperations'
import { emptyForm, formFromMetadata, type JobFormState } from '../lib/recruiterJobFormState'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { VN_LOCATION_NONE_VALUE, VN_MAJOR_LOCATIONS } from '@/lib/vnMajorLocations'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const RecruiterJobEditPage = () => {
  const { jobId = '' } = useParams()
  const navigate = useNavigate()

  const [metaLoadState, setMetaLoadState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [jobMeta, setJobMeta] = useState<JobMetadataDetail | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUploadingJd, setIsUploadingJd] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isTempRemoved, setIsTempRemoved] = useState(false)
  const [form, setForm] = useState<JobFormState>(emptyForm)

  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  const jobDetailHref = `/recruiter/jobs/${encodeURIComponent(jobId)}`

  const loadJobMetadata = useCallback(async () => {
    if (!jobId) {
      setMetaLoadState('done')
      return
    }

    setMetaLoadState('loading')
    try {
      const metadata = await fetchJobMetadataQuery(jobId)
      setJobMeta(metadata)
      if (metadata) {
        setForm(formFromMetadata(metadata))
      } else {
        setForm(emptyForm)
      }
    } catch (err) {
      console.error(err)
      toast.error('Could not load this job. Try again in a moment.')
      setJobMeta(null)
      setForm(emptyForm)
    } finally {
      setMetaLoadState('done')
    }
  }, [jobId])

  useEffect(() => {
    void loadJobMetadata()
  }, [loadJobMetadata])

  const handleFormField = (name: keyof JobFormState, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    if (!apiBase || !jobId) return
    if (!form.title.trim()) {
      toast.error('Job title is required.')
      return
    }
    setIsSaving(true)
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() || ''
      const fd = new FormData()
      fd.append('Title', form.title.trim())
      fd.append('Description', form.description.trim())
      if (form.location.trim()) fd.append('Location', form.location.trim())
      if (form.employmentType.trim()) fd.append('EmploymentType', form.employmentType.trim())
      if (form.experienceLevel.trim()) fd.append('ExperienceLevel', form.experienceLevel.trim())
      if (form.salaryMin.trim()) fd.append('SalaryMin', form.salaryMin.trim())
      if (form.salaryMax.trim()) fd.append('SalaryMax', form.salaryMax.trim())

      await axios.put(`${apiBase}/api/recruiter/jobs/${jobId}`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success(
        'Saved. If you changed the description, matching may run again in the background.',
      )
      await loadJobMetadata()
    } catch (err) {
      console.error(err)
      toast.error('Could not save changes.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTemporaryRemove = () => {
    setIsTempRemoved((prev) => !prev)
    toast.success(
      !isTempRemoved
        ? 'Marked as hidden from candidates (preview only in this build).'
        : 'Marked as visible again (preview only in this build).',
    )
  }

  const handleRefreshRanking = useCallback(async () => {
    if (!apiBase || !jobId) {
      toast.error('Saving changes to the job is unavailable in this environment.')
      return
    }
    try {
      await triggerRecruiterRankingRefresh(apiBase, jobId)
      toast.info('We are refreshing the shortlist. Updates can take a minute to show.', {
        duration: 5000,
      })
    } catch (err) {
      console.error(err)
      toast.error('Could not start a shortlist refresh.')
    }
  }, [apiBase, jobId])

  const handleDelete = async () => {
    if (!apiBase || !jobId) return
    const ok = window.confirm('Delete this job? This action cannot be undone.')
    if (!ok) return
    setIsDeleting(true)
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() || ''
      await axios.delete(`${apiBase}/api/recruiter/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success('Job deleted.')
      navigate('/recruiter/jobs')
    } catch (err) {
      console.error(err)
      toast.error('Could not delete this job.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUploadJd: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !apiBase || !jobId) return
    setIsUploadingJd(true)
    setUploadProgress(0)
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() || ''
      const fd = new FormData()
      fd.append('file', file)
      await axios.post(`${apiBase}/api/recruiter/jobs/${jobId}/jd`, fd, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (e) => {
          if (!e.total) return
          const value = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(value)
        },
      })
      toast.success('File received. The job summary will update when processing finishes.')
      await loadJobMetadata()
    } catch (err) {
      console.error(err)
      toast.error('Could not upload that file.')
    } finally {
      event.target.value = ''
      setIsUploadingJd(false)
      setTimeout(() => setUploadProgress(0), 800)
    }
  }

  const parseStatus = useMemo(() => jobMeta?.parseStatus || jobMeta?.status || null, [jobMeta])

  if (!jobId) {
    return <p className="text-muted-foreground">Missing job id.</p>
  }

  const isLoadingMeta = metaLoadState === 'loading' || metaLoadState === 'idle'

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <span className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border-primary/20 rounded-xl border p-2">
            <Briefcase className="h-6 w-6" />
          </span>
          Edit job
        </span>
      }
      description="Update the posting the same way you create a new role — then save. Upload a PDF or Word file if the description lives in a document."
      className="relative py-6"
      bodyClassName="relative space-y-8"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={jobDetailHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to job
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/recruiter/create-job">Create another job</Link>
          </Button>
        </div>
      }
    >
      <div className="from-background/0 via-background/20 to-background pointer-events-none absolute inset-0 z-0 bg-linear-to-b" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <div className="border-border/40 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="text-muted-foreground min-h-5 text-sm">
            {isLoadingMeta ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading job…
              </span>
            ) : jobMeta?.companyName ? (
              <span>{jobMeta.companyName}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadJobMetadata()}
              disabled={isLoadingMeta}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMeta ? 'animate-spin' : ''}`} />
              Refresh job info
            </Button>
            {apiBase ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting…' : 'Delete job'}
              </Button>
            ) : null}
            {apiBase ? (
              <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            ) : null}
            {apiBase ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleRefreshRanking()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh shortlist
              </Button>
            ) : null}
          </div>
        </div>

        {!apiBase ? (
          <p className="text-muted-foreground text-sm">
            This preview cannot reach your company server, so save, delete, and file upload are
            turned off. You can still reload what is already stored for this job.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card className="glass-panel p-8">
              <div className="space-y-8">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label
                      htmlFor="edit-job-title"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <Sparkles className="text-primary h-4 w-4" />
                      Job title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="edit-job-title"
                      className="bg-surface-low border-border/50 focus-visible:ring-primary h-12"
                      value={form.title}
                      onChange={(e) => handleFormField('title', e.target.value)}
                      disabled={!apiBase}
                      placeholder="e.g. Senior Machine Learning Engineer"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="edit-job-description"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <Building2 className="text-primary h-4 w-4" />
                      Job description <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="edit-job-description"
                      className="bg-surface-low border-border/50 focus-visible:ring-primary min-h-[280px] resize-y p-4 text-base"
                      value={form.description}
                      onChange={(e) => handleFormField('description', e.target.value)}
                      disabled={!apiBase}
                      placeholder="Describe the role, responsibilities, and what a strong hire looks like…"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="edit-job-location"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <MapPin className="text-muted-foreground h-4 w-4" />
                        Location
                      </Label>
                      <Select
                        value={form.location || undefined}
                        onValueChange={(value) =>
                          handleFormField(
                            'location',
                            value === VN_LOCATION_NONE_VALUE ? '' : value,
                          )
                        }
                        disabled={!apiBase}
                      >
                        <SelectTrigger id="edit-job-location" className="bg-surface-low border-border/50 h-11 w-full">
                          <SelectValue placeholder="Select a city/province" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border/50 max-h-72">
                          <SelectItem value={VN_LOCATION_NONE_VALUE}>No specific location</SelectItem>
                          {VN_MAJOR_LOCATIONS.map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-employment-type" className="text-sm font-semibold">
                        Employment type
                      </Label>
                      <Select
                        value={form.employmentType}
                        onValueChange={(v) => handleFormField('employmentType', v)}
                        disabled={!apiBase}
                      >
                        <SelectTrigger className="bg-surface-low border-border/50 h-11 w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border/50">
                          <SelectItem value="full-time">Full-Time</SelectItem>
                          <SelectItem value="part-time">Part-Time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="internship">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor="edit-salary-min"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <DollarSign className="text-muted-foreground h-4 w-4" />
                        Min salary
                      </Label>
                      <Input
                        id="edit-salary-min"
                        type="number"
                        className="bg-surface-low border-border/50 h-11"
                        value={form.salaryMin}
                        onChange={(e) => handleFormField('salaryMin', e.target.value)}
                        disabled={!apiBase}
                        placeholder="e.g. 100000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="edit-salary-max"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <DollarSign className="text-muted-foreground h-4 w-4" />
                        Max salary
                      </Label>
                      <Input
                        id="edit-salary-max"
                        type="number"
                        className="bg-surface-low border-border/50 h-11"
                        value={form.salaryMax}
                        onChange={(e) => handleFormField('salaryMax', e.target.value)}
                        disabled={!apiBase}
                        placeholder="e.g. 150000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-exp-level" className="text-sm font-semibold">
                        Experience level
                      </Label>
                      <Select
                        value={form.experienceLevel}
                        onValueChange={(v) => handleFormField('experienceLevel', v)}
                        disabled={!apiBase}
                      >
                        <SelectTrigger className="bg-surface-low border-border/50 h-11 w-full">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border/50">
                          <SelectItem value="entry">Entry (0-2y)</SelectItem>
                          <SelectItem value="mid">Mid (3-5y)</SelectItem>
                          <SelectItem value="senior">Senior (6-10y)</SelectItem>
                          <SelectItem value="lead">Lead (10+y)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="border-border/30 flex flex-wrap items-center gap-4 border-t pt-6">
                  <Button
                    type="button"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base font-semibold"
                    onClick={() => void handleSave()}
                    disabled={isSaving || !apiBase || !form.title.trim()}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="mr-3 h-5 w-5" />
                        Save changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-border/50 gap-0 border shadow-sm">
              <CardHeader className="border-b pb-4">
                <CardTitle>Job description file</CardTitle>
                <CardDescription>
                  Upload a PDF or Word file if your official description lives outside this form.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Processing: {parseStatus ?? '—'}</Badge>
                  <Badge variant={isTempRemoved ? 'destructive' : 'outline'}>
                    {isTempRemoved ? 'Hidden (preview)' : 'Visible'}
                  </Badge>
                </div>

                {isLoadingMeta ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : null}

                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragActive(true)
                  }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={() => setIsDragActive(false)}
                  className={cn(
                    'rounded-xl border-2 border-dashed p-5 transition-colors',
                    isDragActive ? 'border-primary bg-primary/5' : 'border-border/70',
                  )}
                >
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Drop a file here, or choose one</p>
                    <Label
                      htmlFor="edit-jd-file"
                      className={cn(
                        'border-input bg-background inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm shadow-xs',
                        !apiBase && 'pointer-events-none opacity-50',
                      )}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {isUploadingJd ? 'Uploading…' : 'Choose file'}
                    </Label>
                    <Input
                      id="edit-jd-file"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleUploadJd}
                      disabled={isUploadingJd || !apiBase}
                    />
                    {isUploadingJd || uploadProgress > 0 ? (
                      <div className="space-y-1">
                        <Progress value={uploadProgress} />
                        <p className="text-muted-foreground text-xs">{uploadProgress}%</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleSave} disabled={isSaving || !apiBase}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    variant={isTempRemoved ? 'default' : 'secondary'}
                    onClick={handleTemporaryRemove}
                  >
                    {isTempRemoved ? 'Show on boards again' : 'Hide from boards (preview)'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDelete}
                    disabled={isDeleting || !apiBase}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'Deleting…' : 'Delete job'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ghost-border bg-surface-low/30 space-y-3 p-5 text-sm backdrop-blur-sm">
              <h4 className="text-foreground flex items-center gap-2 font-semibold">
                <Sparkles className="text-primary h-4 w-4" />
                While you edit
              </h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Title and description are what your pipeline uses first. Salary and location help
                candidates and ranking quality. After you save, the job page refreshes automatically
                when new text is ready.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PortalPageShell>
  )
}
