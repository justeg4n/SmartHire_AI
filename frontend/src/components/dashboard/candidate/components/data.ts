import type { ApplicationItem, JobSuggestion } from './types'

export const jobSuggestions: JobSuggestion[] = [
  {
    jobId: '1',
    jobTitle: 'Senior Backend Engineer',
    company: 'TechCorp Inc.',
    location: 'Remote',
    biScore: 78.5,
    crossScore: 85.2,
    finalScore: 82.5,
    matchExplanation:
      'Strong fit due to extensive AWS and Python experience. Your serverless architecture background aligns with this team stack.',
    requiredSkills: ['AWS Lambda', 'Python', 'PostgreSQL', 'Docker'],
    salary: '$120k - $160k',
  },
  {
    jobId: '2',
    jobTitle: 'Full Stack Developer',
    company: 'StartupX',
    location: 'San Francisco, CA',
    biScore: 82.1,
    crossScore: 88.7,
    finalScore: 86.3,
    matchExplanation:
      'Excellent match for your React and Node.js profile. Your API integration and system design work stands out for this role.',
    requiredSkills: ['React', 'Node.js', 'TypeScript', 'MongoDB'],
    salary: '$110k - $145k',
  },
  {
    jobId: '3',
    jobTitle: 'DevOps Engineer',
    company: 'CloudScale',
    location: 'Remote',
    biScore: 75.3,
    crossScore: 79.8,
    finalScore: 78.1,
    matchExplanation:
      'Great fit for infrastructure and CI/CD workflows. Terraform and container orchestration are directly relevant to this opening.',
    requiredSkills: ['Kubernetes', 'Terraform', 'AWS', 'CI/CD'],
    salary: '$130k - $170k',
  },
]

export const applications: ApplicationItem[] = [
  {
    id: '1',
    jobTitle: 'Senior Backend Engineer',
    company: 'TechCorp',
    status: 'reviewing',
    appliedDate: '2026-03-28',
    matchScore: 82.5,
  },
  {
    id: '2',
    jobTitle: 'Cloud Architect',
    company: 'InnovateLabs',
    status: 'interviewing',
    appliedDate: '2026-03-25',
    matchScore: 88.2,
  },
  {
    id: '3',
    jobTitle: 'Software Engineer',
    company: 'StartupHub',
    status: 'applied',
    appliedDate: '2026-03-30',
    matchScore: 76.4,
  },
]
