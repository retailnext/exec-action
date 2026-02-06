/**
 * Integration test for FIFO combined output mode.
 * This test runs the real implementation without mocking.
 */
import { describe, it, expect } from '@jest/globals'
import { executeCommand } from '../src/main.js'

describe('FIFO Integration Test', () => {
  it('executeCommand works with combined output (FIFO)', async () => {
    const result = await executeCommand('echo "hello world"', false)

    expect(result.combinedOutput).toContain('hello world')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  }, 15000) // 15 second timeout
})
