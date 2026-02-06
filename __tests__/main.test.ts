/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the github-actions module is mocked in
 * this test, so that the actual module is not imported.
 */
import { jest } from '@jest/globals'
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
    it('Executes a successful command with combined output (default)', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'echo "Hello World"'
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output was set
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('Hello World')
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')

      // Verify stdout and stderr were NOT set
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stdout',
        expect.anything()
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stderr',
        expect.anything()
      )

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Executes a successful command with separate outputs when enabled', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'echo "Hello World"'
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Verify outputs were set
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('Hello World')
      )
      expect(core.setOutput).toHaveBeenCalledWith('stderr', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')

      // Verify combined_output was NOT set
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'combined_output',
        expect.anything()
      )

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Sets a failed status when command fails (combined mode)', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 1"'
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output was set
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.any(String)
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify that the action was marked as failed
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 1')
      )
    }, 15000)

    it('Sets a failed status when command fails (separate mode)', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 1"'
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Verify outputs were set
      expect(core.setOutput).toHaveBeenCalledWith('stdout', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('stderr', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify that the action was marked as failed
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 1')
      )
    }, 20000)

    it('Treats non-zero exit code as success when specified', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 1"'
        if (name === 'success_exit_codes') return '0,1'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output was set
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.any(String)
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Treats exit code in range as success', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'sh -c "exit 5"'
        if (name === 'success_exit_codes') return '0-10'
        if (name === 'separate_outputs') return ''
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
        if (name === 'separate_outputs') return ''
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


  // Matrix-based testing for both output modes
  describe.each([
    { mode: 'combined', separateOutputs: false },
    { mode: 'separate', separateOutputs: true }
  ])('executeCommand in $mode mode', ({ mode, separateOutputs }) => {
    it(`captures output correctly`, async () => {
      const result = await executeCommand('echo "test output"', separateOutputs)
      expect(result.exitCode).toBe(0)
      
      if (separateOutputs) {
        expect(result.stdout).toContain('test output')
        expect(result.stderr).toBe('')
        expect(result.combinedOutput).toBe('')
      } else {
        expect(result.combinedOutput).toContain('test output')
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('')
      }
    }, 15000)

    it(`captures both stdout and stderr`, async () => {
      const result = await executeCommand('sh -c "echo out; echo err >&2"', separateOutputs)
      expect(result.exitCode).toBe(0)
      
      if (separateOutputs) {
        expect(result.stdout).toContain('out')
        expect(result.stderr).toContain('err')
      } else {
        expect(result.combinedOutput).toContain('out')
        expect(result.combinedOutput).toContain('err')
      }
    }, 15000)

    it(`handles command failure`, async () => {
      const result = await executeCommand('sh -c "exit 42"', separateOutputs)
      expect(result.exitCode).toBe(42)
    }, 20000)

    it(`handles multi-line output`, async () => {
      const result = await executeCommand('sh -c "echo line1; echo line2; echo line3"', separateOutputs)
      expect(result.exitCode).toBe(0)
      
      if (separateOutputs) {
        expect(result.stdout).toContain('line1')
        expect(result.stdout).toContain('line2')
        expect(result.stdout).toContain('line3')
      } else {
        expect(result.combinedOutput).toContain('line1')
        expect(result.combinedOutput).toContain('line2')
        expect(result.combinedOutput).toContain('line3')
      }
    }, 15000)

    it(`works with commands in PATH`, async () => {
      const result = await executeCommand('ls -la', separateOutputs)
      expect(result.exitCode).toBe(0)
      
      if (separateOutputs) {
        expect(result.stdout.length).toBeGreaterThan(0)
      } else {
        expect(result.combinedOutput.length).toBeGreaterThan(0)
      }
    }, 15000)

    it(`works with npm commands`, async () => {
      const result = await executeCommand('npm --version', separateOutputs)
      expect(result.exitCode).toBe(0)
      
      if (separateOutputs) {
        expect(result.stdout.length).toBeGreaterThan(0)
      } else {
        expect(result.combinedOutput.length).toBeGreaterThan(0)
      }
    }, 15000)

    it(`rejects when command not found`, async () => {
      // Test that error event is properly handled when spawning non-existent command
      await expect(
        executeCommand('command_that_definitely_does_not_exist_xyz123', separateOutputs)
      ).rejects.toThrow()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('Rejects with error for empty command', async () => {
      await expect(executeCommand('', false)).rejects.toThrow('Command cannot be empty')
      await expect(executeCommand('   ', false)).rejects.toThrow('Command cannot be empty')
    })

    it('Handles commands with only whitespace output', async () => {
      const result = await executeCommand('echo ""', true)
      expect(result.exitCode).toBe(0)
    })
  })

  describe('parseSuccessExitCodes edge cases', () => {
    it('Throws error for negative individual exit code', () => {
      // -1 by itself is parsed as a range format, so it throws range format error
      // This is acceptable behavior - testing that negative codes are rejected
      expect(() => parseSuccessExitCodes('-1')).toThrow('Invalid range format')
    })

    it('Throws error for range with negative start', () => {
      expect(() => parseSuccessExitCodes('0--1')).toThrow()
    })
    
    it('Throws error when range start is negative', () => {
      expect(() => parseSuccessExitCodes('-5-10')).toThrow()
    })
  })
})
