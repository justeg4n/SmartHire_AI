import React, { useState } from 'react'
import axios from 'axios'
import { Loader2, Sparkles, Building2, MapPin, Briefcase, DollarSign } from 'lucide-react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VN_LOCATION_NONE_VALUE, VN_MAJOR_LOCATIONS } from '@/lib/vnMajorLocations'
import { useNavigate } from 'react-router-dom'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const JobCreation: React.FC = () => {
  const navigate = useNavigate()
  const [jobTitle, setJobTitle] = useState('')
  const [jdText, setJdText] = useState('')
  const [location, setLocation] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('mid')
  const [employmentType, setEmploymentType] = useState('full-time')
  const [jobState, setJobState] = useState<'idle' | 'creating' | 'complete'>('idle')

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (jobState !== 'idle') return

    if (!jobTitle.trim() || !jdText.trim()) {
      toast.error('Job title and description cannot be empty.')
      return
    }

    try {
      setJobState('creating')

      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() || ''
      if (!token) {
        toast.error('Missing auth token. Please login again.')
        setJobState('idle')
        return
      }

      const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
      const endpoint = envApiBaseUrl ? `${envApiBaseUrl}/api/recruiter/jobs` : null
      if (!endpoint) {
        toast.error('API base URL is not configured.')
        setJobState('idle')
        return
      }

      const formData = new FormData()
      formData.append('Title', jobTitle.trim())
      formData.append('Description', jdText.trim())
      if (location.trim()) formData.append('Location', location.trim())
      formData.append('EmploymentType', employmentType)
      if (salaryMin.trim()) formData.append('SalaryMin', salaryMin.trim())
      if (salaryMax.trim()) formData.append('SalaryMax', salaryMax.trim())
      formData.append('ExperienceLevel', experienceLevel)

      await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      toast.success('Job created. JD processing has started in the background.')
      setJobState('complete')

      navigate('/recruiter')
    } catch (err) {
      console.error('Job Blueprint Creation Process failed:', err)
      let message = 'Failed to create job.'
      if (axios.isAxiosError(err)) {
        const payload = err.response?.data
        if (payload && typeof payload === 'object' && 'message' in payload) {
          const m = (payload as { message?: unknown }).message
          if (typeof m === 'string') message = m
        }
      } else if (err instanceof Error) {
        message = err.message
      }
      toast.error(message)
      setJobState('idle')
    }
  }

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <span className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border-primary/20 rounded-xl border p-2">
            <Briefcase className="h-6 w-6" />
          </span>
          Create New Job
        </span>
      }
      description="Post a job requirement and trigger our hybrid AI matching engine to discover the perfect candidates instantly."
      className="relative py-6"
      bodyClassName="relative space-y-8"
    >
      {/* Decorative Background */}
      <div className="from-background/0 via-background/20 to-background pointer-events-none absolute inset-0 z-0 bg-linear-to-b" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          {/* Main Form Area */}
          <div className="xl:col-span-2">
            <Card className="glass-panel p-8">
              <form onSubmit={handleCreateJob} className="space-y-8">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label
                      htmlFor="job-title"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <Sparkles className="text-primary h-4 w-4" />
                      Job Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="job-title"
                      name="Title"
                      type="text"
                      className="bg-surface-low border-border/50 focus-visible:ring-primary h-12"
                      placeholder="e.g. Senior Machine Learning Engineer"
                      autoComplete="off"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      disabled={jobState === 'creating'}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="jd-text"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <Building2 className="text-primary h-4 w-4" />
                      Job Description <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="jd-text"
                      name="Description"
                      autoComplete="off"
                      spellCheck={false}
                      className="bg-surface-low border-border/50 focus-visible:ring-primary min-h-[280px] resize-y p-4 text-base"
                      placeholder="Describe the overall role, responsibilities, technical requirements, and what it takes to succeed..."
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      disabled={jobState === 'creating'}
                      required
                    />
                    <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                      <span>Full markup and text supported.</span>
                      <span>The AI will extract required skills and vector embeddings.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="job-location"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <MapPin className="text-muted-foreground h-4 w-4" />
                        Location
                      </Label>
                      <Select
                        value={location || undefined}
                        onValueChange={(value) =>
                          setLocation(value === VN_LOCATION_NONE_VALUE ? '' : value)
                        }
                        disabled={jobState === 'creating'}
                      >
                        <SelectTrigger id="job-location" className="bg-surface-low border-border/50 h-11 w-full">
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
                      <Label htmlFor="employment-type" className="text-sm font-semibold">
                        Employment Type
                      </Label>
                      <Select
                        value={employmentType}
                        onValueChange={setEmploymentType}
                        disabled={jobState === 'creating'}
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
                        htmlFor="salary-min"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <DollarSign className="text-muted-foreground h-4 w-4" />
                        Min Salary
                      </Label>
                      <Input
                        id="salary-min"
                        type="number"
                        className="bg-surface-low border-border/50 h-11"
                        placeholder="e.g. 100000"
                        value={salaryMin}
                        onChange={(e) => setSalaryMin(e.target.value)}
                        disabled={jobState === 'creating'}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="salary-max"
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <DollarSign className="text-muted-foreground h-4 w-4" />
                        Max Salary
                      </Label>
                      <Input
                        id="salary-max"
                        type="number"
                        className="bg-surface-low border-border/50 h-11"
                        placeholder="e.g. 150000"
                        value={salaryMax}
                        onChange={(e) => setSalaryMax(e.target.value)}
                        disabled={jobState === 'creating'}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="exp-level" className="text-sm font-semibold">
                        Experience Level
                      </Label>
                      <Select
                        value={experienceLevel}
                        onValueChange={setExperienceLevel}
                        disabled={jobState === 'creating'}
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
                    type="submit"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base font-semibold transition-colors"
                    disabled={jobState === 'creating' || !jobTitle || !jdText}
                  >
                    {jobState === 'creating' ? (
                      <>
                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                        Orchestrating AI Pipeline...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-3 h-5 w-5" />
                        Post Job & Launch Engine
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border/50 hover:bg-surface-low h-12 px-6"
                    onClick={() => navigate('/recruiter')}
                    disabled={jobState === 'creating'}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Side Panel Area */}
          <div className="space-y-6">
            <Card className="glass-panel border-primary/20 bg-surface-low/50 space-y-4 p-6">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="text-primary h-5 w-5" />
                Intelligent Matching
              </h3>
              <p className="text-foreground/80 text-sm leading-relaxed">
                As soon as you publish this role, our pipeline activates instantly to evaluate our
                entire candidate database.
              </p>
              <div className="space-y-3 pt-2">
                {[
                  { title: 'Vector Embeddings', desc: 'Converts JD into dense context vectors' },
                  { title: 'Hybrid Retrieval', desc: 'Combines keyword & semantic search' },
                  { title: 'Live shortlist', desc: 'Shows new matches as scoring finishes' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-background/40 border-border/30 ghost-border flex gap-3 rounded-lg border p-3"
                  >
                    <div className="bg-primary/20 text-primary border-primary/30 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-foreground/90 text-sm font-semibold">{item.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="ghost-border bg-surface-low/30 space-y-3 p-5 text-sm backdrop-blur-sm">
              <h4 className="text-foreground flex items-center gap-2 font-semibold">
                <div className="bg-tertiary h-2 w-2 rounded-full" />
                API Information
              </h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Currently, Title and Description properties are persisted to the database and
                trigger the Step Functions pipeline. Other metadata fields are included for preview
                context only during this beta.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PortalPageShell>
  )
}
