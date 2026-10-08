import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import type { JobSuggestion } from './types'

interface CandidateJobMatchesProps {
  jobs: JobSuggestion[]
}

export function CandidateJobMatches({ jobs }: CandidateJobMatchesProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">AI-Matched Jobs</h2>
          <p className="text-muted-foreground text-sm md:text-base">
            Personalized recommendations based on CV analysis and role fit signals.
          </p>
        </div>
        <Badge className="bg-primary/15 text-primary hover:bg-primary/20 w-fit gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Real-time matches
        </Badge>
      </div>

      <div className="space-y-4">
        {jobs.map((job) => (
          <Card key={job.jobId} className="border-border/70 overflow-hidden">
            <CardContent className="grid gap-6 p-6 md:grid-cols-[180px_1fr]">
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs tracking-[0.08rem] uppercase">
                  Match Score
                </p>
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <span className="font-display text-primary text-4xl font-bold">
                      {Math.round(job.finalScore)}
                    </span>
                    <span className="text-muted-foreground pb-1 text-sm">/ 100</span>
                  </div>
                  <Progress value={job.finalScore} className="h-2" />
                </div>
                <p className="text-muted-foreground text-xs">
                  BI {job.biScore}% | CE {job.crossScore}%
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">{job.jobTitle}</h3>
                    <p className="text-muted-foreground text-sm">
                      {job.company} | {job.location}
                    </p>
                  </div>
                  <p className="text-primary text-lg font-semibold">{job.salary}</p>
                </div>

                <p className="text-muted-foreground text-sm leading-relaxed">
                  {job.matchExplanation}
                </p>

                <div className="flex flex-wrap gap-2">
                  {job.requiredSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to={`/apply/${job.jobId}`}>View Details</Link>
                  </Button>
                  <Button variant="outline">Apply Now</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
