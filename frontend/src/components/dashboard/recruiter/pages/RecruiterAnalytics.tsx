/**
 * RecruiterAnalytics
 *
 * A premium, technical-minimalist analytics dashboard for recruiters.
 * Follows the "Neon Protocol" Design System:
 * - Typography: Outfit (Sans), Space Grotesk (Display)
 * - Aesthetic: HUD metrics, data-dense, high-contrast
 * - Interactive: Responsive Recharts and Hover-aware cards
 */

import { memo, useMemo } from 'react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { Users, Briefcase, Target, Clock, ArrowUpRight, TrendingUp, Filter } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { AiStatusBadge, type AiStatusVariant } from '@/components/ui/AiStatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortalPageShell } from '../../shared/PortalPageShell'

// Mock data (Synthesized following "No fake data" rule - used as visual placeholders)
const PIPELINE_DATA = [
  { name: 'Mon', applications: 45, interviews: 12, offers: 3 },
  { name: 'Tue', applications: 52, interviews: 15, offers: 4 },
  { name: 'Wed', applications: 38, interviews: 10, offers: 2 },
  { name: 'Thu', applications: 65, interviews: 22, offers: 6 },
  { name: 'Fri', applications: 48, interviews: 18, offers: 5 },
  { name: 'Sat', applications: 24, interviews: 8, offers: 1 },
  { name: 'Sun', applications: 18, interviews: 5, offers: 1 },
]

const TOP_JOBS = [
  { id: 1, title: 'Senior AI Engineer', applicants: 124, matchRate: 88, status: 'analyzing' },
  { id: 2, title: 'Lead Product Designer', applicants: 89, matchRate: 92, status: 'ranked' },
  { id: 3, title: 'Cloud Architect (AWS)', applicants: 56, matchRate: 75, status: 'matched' },
  { id: 4, title: 'Full Stack Developer', applicants: 210, matchRate: 65, status: 'processing' },
]

const RecruiterAnalyticsComponent = () => {
  // Memoized Chart UI styles for theme awareness
  const chartColors = useMemo(
    () => ({
      primary: 'var(--primary)',
      secondary: 'var(--secondary)',
      muted: 'var(--muted-foreground)',
      border: 'var(--border)',
      grid: 'rgba(120, 120, 120, 0.1)',
    }),
    [],
  )

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <>
          Recruiter <span className="text-primary">Analytics</span>
        </>
      }
      description="Real-time insights across your hiring pipeline, powered by Neon Protocol AI scoring."
      className="py-6"
      bodyClassName="space-y-8"
      actions={
        <>
          <Button variant="outline" className="rounded-full">
            <Filter className="mr-2 size-4" />
            Filters
          </Button>
          <Button className="shadow-primary/20 rounded-full shadow-lg">
            Export Report
            <ArrowUpRight className="ml-2 size-4" />
          </Button>
        </>
      }
    >
      {/* ── Top HUD Metrics ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-panel border-border/10 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                  Avg. Match Score
                </p>
                <h3 className="font-display mt-1 text-3xl font-bold">84.2</h3>
              </div>
              <MatchScoreGauge score={84} size="sm" showLabel={false} />
            </div>
            <div className="text-primary mt-4 flex items-center gap-2 text-xs font-medium">
              <ArrowUpRight className="size-3" />
              <span>+4.2% from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/10 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                  Candidates Screened
                </p>
                <h3 className="font-display mt-1 text-3xl font-bold">2,481</h3>
              </div>
              <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
                <Users className="text-primary size-5" />
              </div>
            </div>
            <div className="text-primary mt-4 flex items-center gap-2 text-xs font-medium">
              <ArrowUpRight className="size-3" />
              <span>+12.8% growth</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/10 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                  Active Job Posts
                </p>
                <h3 className="font-display mt-1 text-3xl font-bold">38</h3>
              </div>
              <div className="bg-secondary/20 flex size-10 items-center justify-center rounded-lg">
                <Briefcase className="text-foreground size-5" />
              </div>
            </div>
            <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
              <span>8 jobs pending AI review</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/10 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                  Time to Hire
                </p>
                <h3 className="font-display mt-1 text-3xl font-bold">18d</h3>
              </div>
              <div className="bg-chart-2/10 flex size-10 items-center justify-center rounded-lg">
                <Clock className="text-chart-2 size-5" />
              </div>
            </div>
            <div className="text-chart-2 mt-4 flex items-center gap-2 text-xs font-medium">
              <TrendingUp className="size-3" rotate={180} />
              <span>-2 days (improvement)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Analytics Section ── */}
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="bg-secondary/50 mb-4 p-1">
          <TabsTrigger value="pipeline" className="rounded-md px-6">
            Pipeline Trends
          </TabsTrigger>
          <TabsTrigger value="diversity" className="rounded-md px-6">
            Source Analytics
          </TabsTrigger>
          <TabsTrigger value="cost" className="rounded-md px-6">
            Cost Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main Trend Chart */}
            <Card className="glass-panel lg:col-span-2">
              <CardHeader>
                <CardTitle>Hiring Throughput</CardTitle>
                <CardDescription>
                  Daily application and offer volume across all departments.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[350px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={PIPELINE_DATA}>
                    <defs>
                      <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={chartColors.grid}
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartColors.muted, fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: chartColors.border,
                        borderRadius: '0.75rem',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="applications"
                      stroke={chartColors.primary}
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorApps)"
                    />
                    <Area
                      type="monotone"
                      dataKey="interviews"
                      stroke="var(--secondary)"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Jobs Table */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Top Performing Jobs</CardTitle>
                <CardDescription>Most candidate-dense openings.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <div className="flex flex-col">
                  {TOP_JOBS.map((job) => (
                    <div
                      key={job.id}
                      className="border-border/5 hover:bg-secondary/30 flex items-center justify-between border-b px-6 py-4 transition-colors"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold tracking-tight">{job.title}</span>
                        <AiStatusBadge
                          status={job.status as AiStatusVariant}
                          className="origin-left scale-90"
                        />
                      </div>
                      <div className="text-right">
                        <span className="font-display text-lg font-bold">{job.applicants}</span>
                        <p className="text-muted-foreground text-[10px] font-medium tracking-tighter uppercase">
                          Applicants
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4">
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground w-full text-xs font-medium"
                  >
                    View All Active Roles
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Recommendations Row ── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="gradient-primary-subtle group border-primary/20 hover:bg-primary/5 flex flex-col justify-between rounded-xl border p-8 transition-all">
          <div>
            <Target className="text-primary mb-4 size-8" />
            <h3 className="font-display text-xl font-bold">Optimization Suggestion</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Your "Senior AI Engineer" role has a high volume of matches but low interview
              conversions. We recommend refining the initial screening questions to narrow the
              pipeline.
            </p>
          </div>
          <Button
            variant="link"
            className="text-primary mt-6 w-fit p-0 font-semibold group-hover:underline"
          >
            View Optimization Plan →
          </Button>
        </div>

        <div className="bg-secondary/20 border-border/10 hover:bg-secondary/40 flex flex-col justify-between rounded-xl border p-8 transition-all">
          <div>
            <Briefcase className="text-foreground mb-4 size-8" />
            <h3 className="font-display text-xl font-bold">Talent Source Quality</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              LinkedIn continues to be your highest converting source (42%) for technical roles,
              while Indeed provides the highest volume for support positions.
            </p>
          </div>
          <Button
            variant="link"
            className="text-foreground w-fit p-0 font-semibold group-hover:underline"
          >
            Manage Sources →
          </Button>
        </div>
      </div>
    </PortalPageShell>
  )
}

export const RecruiterAnalytics = memo(RecruiterAnalyticsComponent)
