/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the github-actions module is mocked in
 * this test, so that the actual module is not imported.
 */
import { jest } from '@jest/globals'
import { readFile } from 'fs/promises'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('../src/github-actions.js', () => core)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run, executeCommand, parseSuccessExitCodes, parseCommand } =
  await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('run', () => {
    it('Executes a successful command and sets outputs', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'echo "Hello World"'
        if (name === 'success_exit_codes') return '0'
        return ''
      })

      await run()

      // Verify outputs were set with file paths
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout_file',
        expect.stringMatching(/exec-.*\.stdout$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr_file',
        expect.stringMatching(/exec-.*\.stderr$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Sets a failed status when command fails', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'false'
        if (name === 'success_exit_codes') return '0'
        return ''
      })

      await run()

      // Verify outputs were set with file paths
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout_file',
        expect.stringMatching(/exec-.*\.stdout$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr_file',
        expect.stringMatching(/exec-.*\.stderr$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify that the action was marked as failed
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 1')
      )
    })

    it('Treats non-zero exit code as success when specified', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 1"'
        if (name === 'success_exit_codes') return '0,1'
        return ''
      })

      await run()

      // Verify outputs were set with file paths
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout_file',
        expect.stringMatching(/exec-.*\.stdout$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr_file',
        expect.stringMatching(/exec-.*\.stderr$/)
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Treats exit code in range as success', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 5"'
        if (name === 'success_exit_codes') return '0-10'
        return ''
      })

      await run()

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Handles execution errors', async () => {
      // Use parseCommand with invalid input to trigger an error
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'echo "test\\'
        if (name === 'success_exit_codes') return '0'
        return ''
      })

      await run()

      // Verify that the action was marked as failed due to parse error
      expect(core.setFailed).toHaveBeenCalled()
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('incomplete escape sequence')
      )
    })
  })

  describe('parseCommand', () => {
    it('Parses simple command', () => {
      const result = parseCommand('echo hello')
      expect(result).toEqual(['echo', 'hello'])
    })

    it('Parses command with quoted arguments', () => {
      const result = parseCommand('echo "hello world"')
      expect(result).toEqual(['echo', 'hello world'])
    })

    it('Parses command with single quotes', () => {
      const result = parseCommand("echo 'hello world'")
      expect(result).toEqual(['echo', 'hello world'])
    })

    it('Handles multiple spaces', () => {
      const result = parseCommand('echo  hello   world')
      expect(result).toEqual(['echo', 'hello', 'world'])
    })

    it('Handles escaped characters', () => {
      const result = parseCommand('echo hello\\ world')
      expect(result).toEqual(['echo', 'hello world'])
    })

    it('Handles escaped quotes', () => {
      const result = parseCommand('echo "hello \\"world\\""')
      expect(result).toEqual(['echo', 'hello "world"'])
    })

    it('Returns empty array for empty command', () => {
      const result = parseCommand('')
      expect(result).toEqual([])
    })

    it('Returns empty array for whitespace-only command', () => {
      const result = parseCommand('   ')
      expect(result).toEqual([])
    })

    it('Throws error for unclosed double quote', () => {
      expect(() => parseCommand('echo "hello')).toThrow('unclosed quote')
    })

    it('Throws error for unclosed single quote', () => {
      expect(() => parseCommand("echo 'hello")).toThrow('unclosed quote')
    })

    it('Throws error for trailing escape character', () => {
      expect(() => parseCommand('echo hello\\')).toThrow(
        'incomplete escape sequence'
      )
    })
  })

  describe('parseSuccessExitCodes', () => {
    it('Parses single exit code', () => {
      const result = parseSuccessExitCodes('0')
      expect(result).toEqual(new Set([0]))
    })

    it('Parses multiple exit codes', () => {
      const result = parseSuccessExitCodes('0,1,2')
      expect(result).toEqual(new Set([0, 1, 2]))
    })

    it('Parses range of exit codes', () => {
      const result = parseSuccessExitCodes('0-2')
      expect(result).toEqual(new Set([0, 1, 2]))
    })

    it('Parses mixed individual codes and ranges', () => {
      const result = parseSuccessExitCodes('0,2-4,7')
      expect(result).toEqual(new Set([0, 2, 3, 4, 7]))
    })

    it('Handles whitespace in input', () => {
      const result = parseSuccessExitCodes(' 0 , 1 - 3 , 5 ')
      expect(result).toEqual(new Set([0, 1, 2, 3, 5]))
    })

    it('Returns default (0) for empty input', () => {
      const result = parseSuccessExitCodes('')
      expect(result).toEqual(new Set([0]))
    })

    it('Throws error for invalid format', () => {
      expect(() => parseSuccessExitCodes('abc')).toThrow(
        'Invalid exit code: "abc"'
      )
    })

    it('Throws error for invalid range format', () => {
      expect(() => parseSuccessExitCodes('0-abc')).toThrow(
        'Invalid range format'
      )
    })

    it('Throws error for invalid range (start > end)', () => {
      expect(() => parseSuccessExitCodes('5-2')).toThrow('Invalid range: "5-2"')
    })

    it('Throws error for negative exit code', () => {
      // When parsing "5--1", it becomes a range where end is negative
      // We just verify negative codes are rejected
      expect(() => parseSuccessExitCodes('5--1')).toThrow()
    })
  })

  describe('executeCommand', () => {
    it('Captures stdout from a command to file', async () => {
      const result = await executeCommand('echo "test output"')

      expect(result.stdoutFile).toMatch(/exec-.*\.stdout$/)
      expect(result.stderrFile).toMatch(/exec-.*\.stderr$/)
      expect(result.exitCode).toBe(0)

      // Verify file contents
      const stdoutContent = await readFile(result.stdoutFile, 'utf-8')
      expect(stdoutContent).toContain('test output')
    })

    it('Captures stderr from a command to file', async () => {
      // Use sh to redirect to stderr since we can't use shell operators directly
      const result = await executeCommand('sh -c "echo error output >&2"')

      expect(result.stderrFile).toMatch(/exec-.*\.stderr$/)
      expect(result.exitCode).toBe(0)

      // Verify file contents
      const stderrContent = await readFile(result.stderrFile, 'utf-8')
      expect(stderrContent).toContain('error output')
    })

    it('Captures exit code from a failed command', async () => {
      // Use sh to exit with a specific code
      const result = await executeCommand('sh -c "exit 42"')

      expect(result.exitCode).toBe(42)
    })

    it('Handles multi-line output', async () => {
      // Use sh to run multiple echo commands
      const result = await executeCommand('sh -c "echo line1 && echo line2"')

      expect(result.stdoutFile).toMatch(/exec-.*\.stdout$/)
      expect(result.stderrFile).toMatch(/exec-.*\.stderr$/)
      expect(result.exitCode).toBe(0)

      // Verify file contents
      const stdoutContent = await readFile(result.stdoutFile, 'utf-8')
      expect(stdoutContent).toContain('line1')
      expect(stdoutContent).toContain('line2')
    })

    it('Works with commands in PATH', async () => {
      // Test that we can find executables in PATH without full path
      const result = await executeCommand('echo testing')

      expect(result.exitCode).toBe(0)
      expect(result.stdoutFile).toMatch(/exec-.*\.stdout$/)

      // Verify file has content
      const stdoutContent = await readFile(result.stdoutFile, 'utf-8')
      expect(stdoutContent).toContain('testing')
    })

    it('Works with npm commands', async () => {
      // Test that npm in PATH works
      const result = await executeCommand('npm --version')

      expect(result.exitCode).toBe(0)
      expect(result.stdoutFile).toMatch(/exec-.*\.stdout$/)

      // Verify file has content
      const stdoutContent = await readFile(result.stdoutFile, 'utf-8')
      expect(stdoutContent.length).toBeGreaterThan(0)
    })

    it('Captures both stdout and stderr to separate files', async () => {
      const result = await executeCommand(
        'sh -c "echo stdout message && echo stderr message >&2"'
      )

      expect(result.exitCode).toBe(0)

      // Verify stdout file contents
      const stdoutContent = await readFile(result.stdoutFile, 'utf-8')
      expect(stdoutContent).toContain('stdout message')
      expect(stdoutContent).not.toContain('stderr message')

      // Verify stderr file contents
      const stderrContent = await readFile(result.stderrFile, 'utf-8')
      expect(stderrContent).toContain('stderr message')
      expect(stderrContent).not.toContain('stdout message')
    })
  })
})
