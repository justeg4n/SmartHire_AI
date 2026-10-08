import type { JobSuggestionData } from '@/lib/appSyncOperations'

export type SkillSummaryView = {
  matchedGroups: Array<{ label: string; options: string[]; satisfied_by?: string }>
  missingGroups: Array<{ label: string; options: string[]; satisfied_by?: string }>
  matchedSkills: string[]
  missingSkills: string[]
  hasGroupedData: boolean
  // Structured skill profile from new schema
  cvHardSkills: string[]
  cvProcessSkills: string[]
  cvSoftSkills: string[]
  cvDomainExpertise: string[]
}

function normalizeUnique(values?: Array<string | null | undefined> | null): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const label = value?.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

function shouldUseGroupedSchema(schemaVersion?: string | null): boolean {
  if (!schemaVersion) return false
  const value = Number.parseFloat(schemaVersion)
  return Number.isFinite(value) && value >= 1.0
}

export function buildSkillSummaryView(job: JobSuggestionData): SkillSummaryView {
  const schemaVersion = job.skillSummarySchemaVersion ?? job.skillSummary?.schemaVersion
  const groupedEnabled = shouldUseGroupedSchema(schemaVersion)
  const summary = job.skillSummary
  if (!groupedEnabled || !summary) {
    return {
      matchedGroups: [],
      missingGroups: [],
      matchedSkills: [],
      missingSkills: [],
      hasGroupedData: false,
      cvHardSkills: normalizeUnique(job.hardSkills || job.candidateSkills),
      cvProcessSkills: normalizeUnique(job.processSkills),
      cvSoftSkills: normalizeUnique(job.softSkills),
      cvDomainExpertise: normalizeUnique(job.domainExpertise),
    }
  }

  const mustMatched = normalizeUnique(summary.match?.must)
  const mustMissing = normalizeUnique(summary.missing?.must)
  const niceMatched = normalizeUnique(summary.match?.nice)
  const niceMissing = normalizeUnique(summary.missing?.nice)
  const flatMatched = normalizeUnique([...mustMatched, ...niceMatched])
  const flatMissing = normalizeUnique([...mustMissing, ...niceMissing])
  const candidateSkills = normalizeUnique(
    summary?.candidate?.hardSkills ||
    summary?.candidate?.normalized ||
    job.hardSkills ||
    job.candidateSkills
  )

  // Structured skill profile (new schema)
  const cvHardSkills = normalizeUnique(summary?.candidate?.hardSkills || job.hardSkills || job.candidateSkills)
  const cvProcessSkills = normalizeUnique(summary?.candidate?.processSkills || job.processSkills)
  const cvSoftSkills = normalizeUnique(summary?.candidate?.softSkills || job.softSkills)
  const cvDomainExpertise = normalizeUnique(summary?.candidate?.domainExpertise || job.domainExpertise)

  const matchedGroups: Array<{ label: string; options: string[]; satisfied_by?: string }> = []
  const missingGroups: Array<{ label: string; options: string[]; satisfied_by?: string }> = []

  const oneOfMatchedLabels = new Set(normalizeUnique(summary.match?.oneOf))
  const oneOfMissingLabels = new Set(normalizeUnique(summary.missing?.oneOf))
  
  if (summary.required?.oneOfGroups) {
    for (const group of summary.required.oneOfGroups) {
      if (!group.label || !group.options) continue
      
      const label = group.label.trim()
      const isMatched = oneOfMatchedLabels.has(label.toLowerCase()) || 
        oneOfMatchedLabels.has(label)
      const isMissing = oneOfMissingLabels.has(label.toLowerCase()) || 
        oneOfMissingLabels.has(label)
        
      if (!isMatched && !isMissing) continue
        
      let satisfied_by: string | undefined
      if (isMatched && candidateSkills.length > 0) {
        // Attempt to find which option satisfied this group by checking candidate skills
        const optionsNorm = group.options.map(o => o.toLowerCase().trim())
        for (const cs of candidateSkills) {
          if (optionsNorm.includes(cs.toLowerCase().trim())) {
            satisfied_by = cs
            break
          }
        }
      }
      
      const outGroup = {
        label,
        options: [...group.options],
        satisfied_by
      }
      
      if (isMatched) {
        matchedGroups.push(outGroup)
      } else if (isMissing) {
        missingGroups.push(outGroup)
      }
    }
  }

  return {
    matchedGroups,
    missingGroups,
    matchedSkills: flatMatched,
    missingSkills: flatMissing,
    hasGroupedData: true,
    cvHardSkills,
    cvProcessSkills,
    cvSoftSkills,
    cvDomainExpertise,
  }
}
