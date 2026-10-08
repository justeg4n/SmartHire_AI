/**
 * useCodeRunner
 *
 * Manages code execution state (running / output).
 *
 * The mock `setTimeout` body is the only piece to replace when wiring up
 * the real ECS sandbox API — the hook surface stays the same.
 */

import { useCallback, useState } from 'react'

interface UseCodeRunnerReturn {
  output: string
  isRunning: boolean
  runCode: (code: string, language: string) => void
  clearOutput: () => void
}

const MOCK_DELAY_MS = 1500

function buildMockOutput(language: string): string {
  return `> Running ${language} in ECS Sandbox…

Test Case 1: ✓ PASS  (2 ms)
Test Case 2: ✓ PASS  (1 ms)
Test Case 3: ✗ FAIL  (Expected 5, got 0)

Execution complete · Memory: 12 MB · Time: ${MOCK_DELAY_MS} ms`
}

export function useCodeRunner(): UseCodeRunnerReturn {
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const runCode = useCallback((code: string, language: string) => {
    if (!code.trim()) return
    setIsRunning(true)
    setOutput('')

    // Replace setTimeout body with a real fetch/WebSocket call.
    const id = window.setTimeout(() => {
      setOutput(buildMockOutput(language))
      setIsRunning(false)
    }, MOCK_DELAY_MS)

    // Cleanup only fires if the component unmounts during execution.
    return () => clearTimeout(id)
  }, [])

  const clearOutput = useCallback(() => setOutput(''), [])

  return { output, isRunning, runCode, clearOutput }
}
