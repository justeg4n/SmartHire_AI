import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { AppStatus, ApplicationItem } from './types'

interface CandidateApplicationsTableProps {
  applications: ApplicationItem[]
}

function statusVariant(status: AppStatus): 'secondary' | 'outline' | 'default' {
  if (status === 'interviewing') return 'default'
  if (status === 'reviewing') return 'secondary'
  return 'outline'
}

export function CandidateApplicationsTable({ applications }: CandidateApplicationsTableProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-semibold">Recent Applications</h2>
        <p className="text-muted-foreground text-sm">
          Track status updates across your latest submissions.
        </p>
      </div>

      <Card className="border-border/50 gap-0 overflow-hidden border py-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.jobTitle}</TableCell>
                    <TableCell className="text-muted-foreground">{app.company}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(app.status)}>{app.status}</Badge>
                    </TableCell>
                    <TableCell className="text-primary font-semibold">{app.matchScore}%</TableCell>
                    <TableCell className="text-muted-foreground">{app.appliedDate}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/apply">View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
