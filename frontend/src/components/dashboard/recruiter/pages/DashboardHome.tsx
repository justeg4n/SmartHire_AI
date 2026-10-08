import React from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlayCircle, Clock, CheckCircle2 } from 'lucide-react'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const DashboardHome: React.FC = () => {
  // Mock Active Sessions
  const activeSessions = [
    {
      id: 'INT-001',
      candidate: 'Sarah Jenkins',
      role: 'Senior Frontend Engineer',
      status: 'Live',
      progress: '45m elapsed',
    },
    {
      id: 'INT-002',
      candidate: 'Michael Chen',
      role: 'Backend Developer',
      status: 'Live',
      progress: '12m elapsed',
    },
    {
      id: 'INT-003',
      candidate: 'Elena Rodriguez',
      role: 'DevOps Engineer',
      status: 'Completed',
      progress: 'Finished',
    },
    {
      id: 'INT-004',
      candidate: 'James Smith',
      role: 'Fullstack Developer',
      status: 'Scheduled',
      progress: 'In 2 hours',
    },
  ]

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title="Overview"
      description="Monitor real-time interview sessions and view scheduled events."
      className="animate-in fade-in zoom-in-95 mx-auto w-full max-w-6xl py-6 duration-500"
      bodyClassName="space-y-8"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* KPI Cards */}
        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-500">
              <PlayCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Live Sessions</p>
              <h3 className="text-2xl font-bold text-zinc-50">2</h3>
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-blue-500/10 p-3 text-blue-500">
              <Clock className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Scheduled Today</p>
              <h3 className="text-2xl font-bold text-zinc-50">5</h3>
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-zinc-800 p-3 text-zinc-300">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Completed (Week)</p>
              <h3 className="text-2xl font-bold text-zinc-50">24</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Sessions Table */}
      <Card className="overflow-hidden border-zinc-800 bg-zinc-900/40">
        <div className="border-b border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Live & Recent Sessions</h2>
        </div>

        <div className="px-6 pt-2 pb-6">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Candidate</TableHead>
                <TableHead className="text-zinc-400">Role</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeSessions.map((session) => (
                <TableRow
                  key={session.id}
                  className="border-zinc-800/50 transition-colors hover:bg-zinc-800/50"
                >
                  <TableCell className="font-medium text-zinc-200">{session.candidate}</TableCell>
                  <TableCell className="text-zinc-400">{session.role}</TableCell>
                  <TableCell>
                    {session.status === 'Live' && (
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 px-2.5 text-emerald-400"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Live
                      </Badge>
                    )}
                    {session.status === 'Completed' && (
                      <Badge
                        variant="outline"
                        className="border-zinc-700 bg-zinc-800 text-zinc-300"
                      >
                        Completed
                      </Badge>
                    )}
                    {session.status === 'Scheduled' && (
                      <Badge
                        variant="outline"
                        className="border-blue-500/30 bg-blue-500/10 text-blue-400"
                      >
                        Scheduled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-zinc-500">
                    {session.status === 'Completed' ? (
                      <Link
                        to={`/report/${session.id}`}
                        className="font-medium text-emerald-500 hover:text-emerald-400"
                      >
                        View Report
                      </Link>
                    ) : (
                      session.progress
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </PortalPageShell>
  )
}
