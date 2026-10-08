import { Briefcase, Clock, TrendingUp, Upload } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CandidateStatsGridProps {
  totalMatches: number
  totalApplications: number
}

export function CandidateStatsGrid({ totalMatches, totalApplications }: CandidateStatsGridProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
      <Card className="border-border/50 gap-4 border py-5 shadow-sm">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center justify-between text-xs tracking-[0.08rem] uppercase">
            AI Matches
            <Briefcase className="text-primary h-4 w-4" />
          </CardDescription>
          <CardTitle className="font-display text-3xl">{totalMatches}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">Updated 2 min ago</p>
        </CardContent>
      </Card>

      <Card className="border-border/50 gap-4 border py-5 shadow-sm">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center justify-between text-xs tracking-[0.08rem] uppercase">
            Applications
            <Clock className="h-4 w-4 text-amber-500" />
          </CardDescription>
          <CardTitle className="font-display text-3xl">{totalApplications}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">1 currently under review</p>
        </CardContent>
      </Card>

      <Card className="border-border/50 gap-4 border py-5 shadow-sm">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center justify-between text-xs tracking-[0.08rem] uppercase">
            Avg Match
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardDescription>
          <CardTitle className="font-display text-3xl">82%</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-emerald-500">+5% this week</p>
        </CardContent>
      </Card>

      <Card className="border-primary/35 bg-primary/10 gap-4 border py-5 shadow-sm">
        <CardHeader className="pb-2">
          <CardDescription className="text-primary flex items-center justify-between text-xs tracking-[0.08rem] uppercase">
            Profile Score
            <Upload className="text-primary h-4 w-4" />
          </CardDescription>
          <CardTitle className="font-display text-primary text-3xl">95%</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-primary/80 text-xs">CV analyzed and enriched</p>
        </CardContent>
      </Card>
    </section>
  )
}
