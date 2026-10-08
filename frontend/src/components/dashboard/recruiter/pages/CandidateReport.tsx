import React from 'react'
import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { BrainCircuit, MessageSquare, ShieldAlert } from 'lucide-react'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateReport: React.FC = () => {
  const { id } = useParams()

  // Mock Data for Radar Chart (Skills)
  const skillsData = [
    { subject: 'Frontend', A: 90, fullMark: 100 },
    { subject: 'Backend', A: 65, fullMark: 100 },
    { subject: 'DevOps', A: 50, fullMark: 100 },
    { subject: 'Soft Skills', A: 85, fullMark: 100 },
    { subject: 'Experience', A: 80, fullMark: 100 },
  ]

  // Mock Data for Emotion Timeline
  const emotionData = [
    { time: '00:00', confidence: 60, focus: 80 },
    { time: '05:00', confidence: 75, focus: 85 },
    { time: '10:00', confidence: 85, focus: 90 },
    { time: '15:00', confidence: 40, focus: 95 }, // Struggled with question
    { time: '20:00', confidence: 65, focus: 85 },
    { time: '25:00', confidence: 90, focus: 80 },
    { time: '30:00', confidence: 85, focus: 75 },
    { time: '35:00', confidence: 95, focus: 85 },
  ]

  // Mock Q&A Data
  const qaData = [
    {
      id: 'q1',
      question: 'Can you explain React Server Components and how they differ from traditional SSR?',
      answer:
        'Server components run exclusively on the server and ship zero JavaScript to the client. This differs from SSR, which still sends JS to hydrate the component on the client.',
      score: 95,
      aiFeedback:
        'Excellent technical accuracy. Candidate clearly distinguished between shipping HTML vs hydrating JS.',
    },
    {
      id: 'q2',
      question: 'How would you optimize a large list rendering in a React application?',
      answer:
        'I would use pagination mostly, or maybe try to not load everything at once from the API.',
      score: 45,
      aiFeedback:
        'Missed core frontend patterns. Failed to mention virtualization (e.g., react-window) or layout thrashing avoidance.',
    },
  ]

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <span className="flex items-center gap-3">
          Sarah Jenkins
          <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-sm font-medium text-zinc-400">
            {id || 'INT-001'}
          </span>
        </span>
      }
      description={
        <>
          Senior Frontend Engineer <span className="text-zinc-600">•</span> Completed 2 hours ago
        </>
      }
      actions={
        <div className="text-right">
          <div className="text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Total Fit Score
          </div>
          <div className="mt-1 text-4xl font-bold text-emerald-400">82%</div>
        </div>
      }
      className="animate-in fade-in zoom-in-95 mx-auto w-full max-w-6xl py-6 duration-500"
      bodyClassName="space-y-8"
    >
      {/* KPI Header Scorecard */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="relative flex flex-col gap-2 overflow-hidden border-zinc-800 bg-zinc-900/50 p-6">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <BrainCircuit className="h-24 w-24" aria-hidden="true" />
          </div>
          <div className="text-sm font-medium text-zinc-400">Technical</div>
          <div className="flex items-baseline gap-2 text-4xl font-light text-zinc-100">
            88<span className="text-lg text-zinc-500">/100</span>
          </div>
        </Card>

        <Card className="relative flex flex-col gap-2 overflow-hidden border-zinc-800 bg-zinc-900/50 p-6">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <MessageSquare className="h-24 w-24" aria-hidden="true" />
          </div>
          <div className="text-sm font-medium text-zinc-400">Communication</div>
          <div className="flex items-baseline gap-2 text-4xl font-light text-zinc-100">
            92<span className="text-lg text-zinc-500">/100</span>
          </div>
        </Card>

        <Card className="relative flex flex-col gap-2 overflow-hidden border-zinc-800 bg-zinc-900/50 p-6">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <ShieldAlert className="h-24 w-24" aria-hidden="true" />
          </div>
          <div className="text-sm font-medium text-zinc-400">Problem Solving</div>
          <div className="flex items-baseline gap-2 text-4xl font-light text-zinc-100">
            75<span className="text-lg text-zinc-500">/100</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Radar Chart */}
        <Card className="border-zinc-800 bg-zinc-900/40 p-6">
          <h3 className="mb-6 text-lg font-semibold text-zinc-100">Skill Map Mapping</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={skillsData}>
                <PolarGrid stroke="#3f3f46" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Candidate"
                  dataKey="A"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Emotion Timeline Line Chart */}
        <Card className="border-zinc-800 bg-zinc-900/40 p-6">
          <h3 className="mb-2 text-lg font-semibold text-zinc-100">Emotion & Focus Timeline</h3>
          <p className="mb-6 text-xs text-zinc-500">
            Click graph points to jump video to timestamp (Interactive mock)
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={emotionData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#71717a" fontSize={12} tickMargin={10} />
                <YAxis stroke="#71717a" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                  }}
                  itemStyle={{ color: '#f4f4f5' }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  name="Confidence"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="focus"
                  name="Task Focus"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Q&A Accordion */}
      <h3 className="mt-4 border-b border-zinc-800 pb-2 text-xl font-bold text-zinc-100">
        Interview Breakdown (Q&A)
      </h3>
      <Accordion type="multiple" className="flex w-full flex-col gap-3">
        {qaData.map((qa, index) => (
          <AccordionItem
            key={qa.id}
            value={qa.id}
            className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-4"
          >
            <AccordionTrigger className="py-4 hover:no-underline">
              <div className="flex items-start gap-4 pr-4 text-left">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-bold text-zinc-400">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="leading-relaxed font-medium text-zinc-200">{qa.question}</p>
                </div>
                <div
                  className={`shrink-0 rounded border px-2.5 py-1 text-xs font-bold ${
                    qa.score >= 80
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : qa.score >= 60
                        ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                        : 'border-red-500/30 bg-red-500/10 text-red-400'
                  }`}
                >
                  {qa.score}/100
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 pt-2 pr-4 pb-6 pl-12 text-zinc-300">
              <div>
                <strong className="text-xs tracking-wider text-zinc-500 uppercase">
                  Candidate Answer:
                </strong>
                <p className="relative mt-1 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm">
                  <span className="absolute top-2 -left-2 text-2xl text-zinc-600">"</span>
                  {qa.answer}
                  <span className="absolute -right-2 bottom-0 text-2xl text-zinc-600">"</span>
                </p>
              </div>
              <div>
                <strong className="flex items-center gap-1.5 text-xs tracking-wider text-zinc-500 uppercase">
                  <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" /> AI Feedback:
                </strong>
                <p className="mt-1 font-mono text-sm leading-relaxed text-zinc-400">
                  &gt; {qa.aiFeedback}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </PortalPageShell>
  )
}
