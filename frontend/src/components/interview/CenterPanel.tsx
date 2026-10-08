import React, { memo, useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useTheme } from '@/components/theme'
import { Play, Square, Maximize2, Minimize2, Trash2, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCodeRunner } from './hooks/useCodeRunner'
import { DEFAULT_CODE_PLACEHOLDER, LANGUAGE_OPTIONS, MONACO_OPTIONS } from './config'
import type { CenterPanelProps } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// EditorTopBar
// ─────────────────────────────────────────────────────────────────────────────
const EditorTopBar = memo(function EditorTopBar({
  language,
  onLanguageChange,
  isRunning,
  isFullscreen,
  onRun,
  onToggleFullscreen,
  onEndInterview,
}: {
  language: string
  onLanguageChange: (lang: string) => void
  isRunning: boolean
  isFullscreen: boolean
  onRun: () => void
  onToggleFullscreen: () => void
  onEndInterview?: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      {/* Language picker */}
      <Select value={language} onValueChange={onLanguageChange}>
        <SelectTrigger
          className="border-border bg-card w-40 cursor-pointer text-sm"
          aria-label="Select programming language"
        >
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent className="border-border bg-card text-foreground">
          {LANGUAGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        {/* Fullscreen toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="border-border bg-card hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>

        {/* Run Code */}
        <Button
          onClick={onRun}
          disabled={isRunning}
          aria-busy={isRunning}
          className="cursor-pointer gap-2 bg-emerald-500 font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? (
            <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          )}
          {isRunning ? 'Running…' : 'Run Code'}
        </Button>

        {/* End Interview */}
        {onEndInterview && (
          <Button
            variant="outline"
            onClick={onEndInterview}
            className="cursor-pointer gap-2 border-red-500/40 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
            aria-label="End interview session"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            End Interview
          </Button>
        )}
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// OutputConsole
// ─────────────────────────────────────────────────────────────────────────────
const OutputConsole = memo(function OutputConsole({
  output,
  onClear,
}: {
  output: string
  onClear: () => void
}) {
  return (
    <div
      className="border-border bg-card flex h-48 flex-col overflow-hidden rounded-md border shadow-inner"
      role="region"
      aria-label="Output console"
    >
      <div className="border-border bg-card flex items-center justify-between border-b px-4 py-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Output Console
        </span>
        {output && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Clear console output"
            className="text-muted-foreground hover:text-foreground h-6 w-6 cursor-pointer"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
      <div
        className="text-foreground/80 flex-1 overflow-y-auto p-4 font-mono text-sm"
        aria-live="polite"
      >
        {output ? (
          <pre className="whitespace-pre-wrap">{output}</pre>
        ) : (
          <span className="text-muted-foreground/60 italic">
            Code execution results will appear here…
          </span>
        )}
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// CenterPanel
// ─────────────────────────────────────────────────────────────────────────────
export const CenterPanel: React.FC<CenterPanelProps> = ({
  defaultCode = DEFAULT_CODE_PLACEHOLDER,
  defaultLanguage = 'javascript',
  onEndInterview,
}) => {
  const { resolvedTheme } = useTheme()
  const [language, setLanguage] = useState(defaultLanguage)
  const [code, setCode] = useState(defaultCode)
  const [isFullscreen, setFullscreen] = useState(false)

  const { output, isRunning, runCode, clearOutput } = useCodeRunner()

  const handleRun = useCallback(() => runCode(code, language), [runCode, code, language])
  const handleCodeChange = useCallback((val?: string) => setCode(val ?? ''), [])
  const handleToggleFullscreen = useCallback(() => setFullscreen((v) => !v), [])

  return (
    <div
      className={cn(
        'border-border bg-background flex flex-col border-r',
        isFullscreen ? 'fixed inset-0 z-50 p-4' : 'h-full p-4',
      )}
      role="region"
      aria-label="Code editor"
    >
      <EditorTopBar
        language={language}
        onLanguageChange={setLanguage}
        isRunning={isRunning}
        isFullscreen={isFullscreen}
        onRun={handleRun}
        onToggleFullscreen={handleToggleFullscreen}
        onEndInterview={onEndInterview}
      />

      {/* Monaco Editor */}
      <div className="border-border bg-card/50 mb-4 min-h-100 flex-1 overflow-hidden rounded-md border">
        <Editor
          height="100%"
          language={language}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
          value={code}
          onChange={handleCodeChange}
          options={MONACO_OPTIONS}
          loading={
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Loading editor…
            </div>
          }
        />
      </div>

      <OutputConsole output={output} onClear={clearOutput} />
    </div>
  )
}
