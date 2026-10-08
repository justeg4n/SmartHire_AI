import { type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'

type MatchInsightCardProps = {
  score?: number
  title?: string
  subtitle?: ReactNode
  rightMeta?: ReactNode
  description?: ReactNode
  descriptionClassName?: string
  chips?: string[]
  summarySkills?: string[]
  matchedSkills?: string[]
  missingSkills?: string[]
  matchedGroups?: Array<{ label: string; options: string[]; satisfied_by?: string }>
  missingGroups?: Array<{ label: string; options: string[]; satisfied_by?: string }>
  showCanonicalBadge?: boolean
  actions?: ReactNode
  footer?: ReactNode
}

function normalizeUniqueSkills(skills: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const raw of skills) {
    const skill = raw?.trim()
    if (!skill) continue
    const key = skill.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(skill)
  }

  return normalized
}

function getMatchTone(score: number) {
  if (score >= 80) return { ring: '#10b981', textClass: 'text-emerald-500' }
  if (score >= 60) return { ring: '#0ea5e9', textClass: 'text-sky-500' }
  if (score >= 40) return { ring: '#f59e0b', textClass: 'text-amber-500' }
  return { ring: '#94a3b8', textClass: 'text-slate-400' }
}

const summaryBadgeClassName =
  'border-border/70 bg-muted text-foreground hover:bg-muted/90 dark:bg-muted/50 dark:text-foreground text-xs'
const matchedBadgeClassName =
  'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 text-xs'
const missingBadgeClassName =
  'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 text-xs'

export function MatchInsightCard({
  score = 0,
  title,
  subtitle,
  rightMeta,
  description,
  descriptionClassName,
  chips = [],
  summarySkills = [],
  matchedSkills = [],
  missingSkills = [],
  matchedGroups = [],
  missingGroups = [],
  showCanonicalBadge = false,
  actions,
  footer,
}: MatchInsightCardProps) {
  const tone = getMatchTone(score)
  const compactMatchedSkills = normalizeUniqueSkills([
    ...matchedSkills,
    ...matchedGroups.flatMap((group) => group.options),
    ...matchedGroups.map((group) => group.satisfied_by),
  ])

  const compactMissingSkills = normalizeUniqueSkills([
    ...missingSkills,
    ...missingGroups.flatMap((group) => group.options),
  ])
  const compactSummarySkills = normalizeUniqueSkills(summarySkills)

  return (
    <Card className="border-border/60 bg-card/80 gap-0 border py-4 shadow-sm">
      <CardContent className="flex flex-col gap-4 px-4 py-0 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="relative grid h-24 w-24 place-items-center rounded-full">
              <div
                className="absolute inset-0 z-0 rounded-full"
                style={{
                  background: `conic-gradient(${tone.ring} ${score}%, var(--muted) ${score}% 100%)`,
                }}
              />
              <div className="bg-card absolute inset-2.5 z-1 rounded-full shadow-sm" />
              <div className="relative z-2 flex flex-col items-center justify-center px-1 text-center leading-none">
                <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${tone.textClass}`}>
                  {score}
                  <span className="text-xs font-semibold sm:text-sm">%</span>
                </p>
              </div>
            </div>
            <p className="text-muted-foreground max-w-26 text-center text-[10px] leading-tight tracking-[0.12em] uppercase">
              Match score
            </p>
          </div>

          <div className="max-w-4xl min-w-0 space-y-2.5">
            {title ||
            subtitle ||
            rightMeta ||
            description ||
            chips.length > 0 ||
            showCanonicalBadge ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {title ? (
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="truncate text-xl">{title}</CardTitle>
                        {showCanonicalBadge ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted/30 text-muted-foreground flex h-4.5 shrink-0 items-center gap-1.5 px-1.5 text-[10px] font-semibold tracking-widest uppercase"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            normalised ✓
                          </Badge>
                        ) : null}
                      </div>
                    ) : showCanonicalBadge ? (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted/30 text-muted-foreground flex h-4.5 shrink-0 items-center gap-1.5 px-1.5 text-[10px] font-semibold tracking-widest uppercase"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        normalised ✓
                      </Badge>
                    ) : null}
                    {subtitle ? (
                      <CardDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        {subtitle}
                      </CardDescription>
                    ) : null}
                  </div>
                  {rightMeta}
                </div>

                {description ? (
                  <p
                    className={`text-muted-foreground text-sm leading-relaxed ${descriptionClassName ?? ''}`.trim()}
                  >
                    {description}
                  </p>
                ) : null}

                {chips.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <Badge key={chip} variant="outline" className="bg-background/50 text-xs">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {compactSummarySkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {compactSummarySkills.map((skill) => (
                  <Badge
                    key={`summary-${skill}`}
                    variant="outline"
                    className={summaryBadgeClassName}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            ) : compactMatchedSkills.length > 0 || compactMissingSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {normalizeUniqueSkills([...compactMatchedSkills, ...compactMissingSkills]).map(
                  (skill) => (
                    <Badge
                      key={`fallback-summary-${skill}`}
                      variant="outline"
                      className={summaryBadgeClassName}
                    >
                      {skill}
                    </Badge>
                  ),
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No skill summary is available for this record yet.
              </p>
            )}

            {compactMatchedSkills.length > 0 || compactMissingSkills.length > 0 ? (
              <div className="grid gap-3 pt-1 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-300">
                    Matched skills
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {compactMatchedSkills.length > 0 ? (
                      compactMatchedSkills.map((skill) => (
                        <Badge
                          key={`matched-${skill}`}
                          variant="outline"
                          className={matchedBadgeClassName}
                        >
                          {skill}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-xs">No matched skills found.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-300">
                    Missing skills
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {compactMissingSkills.length > 0 ? (
                      compactMissingSkills.map((skill) => (
                        <Badge
                          key={`missing-${skill}`}
                          variant="outline"
                          className={missingBadgeClassName}
                        >
                          {skill}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-xs">No missing skills found.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {actions || footer ? (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {actions}
                {footer ? (
                  <div className="text-muted-foreground ml-auto text-xs">{footer}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
