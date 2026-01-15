/**
 * Unit tests for src/github-actions.ts
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Import the module to test
const { getInput, setOutput, debug, setFailed } =
  await import('../src/github-actions.js')

describe('github-actions.ts', () => {
  let originalEnv: NodeJS.ProcessEnv
  let originalExitCode: number | undefined
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>

  beforeEach(() => {
    // Save original environment and process state
    originalEnv = { ...process.env }
    originalExitCode = process.exitCode

    // Create spy for stdout
    stdoutSpy = jest.spyOn(process.stdout, 'write') as jest.SpiedFunction<
      typeof process.stdout.write
    >
    stdoutSpy.mockImplementation(() => true)

    // Reset process exit code
    process.exitCode = undefined
  })

  afterEach(() => {
    // Restore original environment and process state
    process.env = originalEnv
    process.exitCode = originalExitCode

    // Restore stdout
    stdoutSpy.mockRestore()
  })

  describe('getInput', () => {
    it('Gets input from environment variable', () => {
      process.env['INPUT_TEST'] = 'test value'
      const result = getInput('test')
      expect(result).toBe('test value')
    })

    it('Converts input name to uppercase', () => {
      process.env['INPUT_MYINPUT'] = 'value'
      const result = getInput('myInput')
      expect(result).toBe('value')
    })

    it('Replaces spaces with underscores in input name', () => {
      process.env['INPUT_MY_INPUT'] = 'value'
      const result = getInput('my input')
      expect(result).toBe('value')
    })

    it('Trims whitespace from input value', () => {
      process.env['INPUT_TEST'] = '  trimmed  '
      const result = getInput('test')
      expect(result).toBe('trimmed')
    })

    it('Returns empty string when input not set', () => {
      const result = getInput('nonexistent')
      expect(result).toBe('')
    })

    it('Throws error when required input is not set', () => {
      expect(() => getInput('required', { required: true })).toThrow(
        'Input required and not supplied: required'
      )
    })

    it('Does not throw when required input is set', () => {
      process.env['INPUT_REQUIRED'] = 'value'
      expect(() => getInput('required', { required: true })).not.toThrow()
    })
  })

  describe('setOutput', () => {
    it('Writes output to GITHUB_OUTPUT file', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-actions-'))
      const outputFile = path.join(tmpDir, 'output.txt')
      process.env['GITHUB_OUTPUT'] = outputFile

      setOutput('test', 'value')

      const content = fs.readFileSync(outputFile, 'utf8')
      expect(content).toMatch(/test<<ghadelimiter_/)
      expect(content).toContain('value')

      // Clean up
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('Handles multiline output values', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-actions-'))
      const outputFile = path.join(tmpDir, 'output.txt')
      process.env['GITHUB_OUTPUT'] = outputFile

      setOutput('test', 'line1\nline2\nline3')

      const content = fs.readFileSync(outputFile, 'utf8')
      expect(content).toContain('line1')
      expect(content).toContain('line2')
      expect(content).toContain('line3')

      // Clean up
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('Does nothing when GITHUB_OUTPUT is not set', () => {
      delete process.env['GITHUB_OUTPUT']
      // Should not throw
      expect(() => setOutput('test', 'value')).not.toThrow()
    })
  })

  describe('debug', () => {
    it('Writes debug message to stdout', () => {
      debug('test message')

      expect(stdoutSpy).toHaveBeenCalledWith('::debug::test message\n')
    })
  })

  describe('setFailed', () => {
    it('Sets exit code to 1', () => {
      setFailed('error message')

      expect(process.exitCode).toBe(1)
    })

    it('Writes error message to stdout', () => {
      setFailed('error message')

      expect(stdoutSpy).toHaveBeenCalledWith('::error::error message\n')
    })
  })
})
