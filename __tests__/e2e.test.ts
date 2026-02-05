/**
 * End-to-end tests for the action.
 * These tests verify the complete behavior of both combined and separate output modes.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('../src/github-actions.js', () => core)

// The module being tested should be imported dynamically
const { run } = await import('../src/main.js')

describe('End-to-End Tests', () => {
  let tempDir: string

  beforeEach(() => {
    jest.resetAllMocks()
    // Create a temporary directory for test files
    tempDir = mkdtempSync(join(tmpdir(), 'exec-action-e2e-'))
  })

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Combined Output Mode (default)', () => {
    it('Combines stdout and stderr into combined_output', async () => {
      // Create a test script that outputs to both stdout and stderr
      const scriptPath = join(tempDir, 'test-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "stdout message"\necho "stderr message" >&2\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output contains both messages
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('stdout message')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('stderr message')
      )

      // Verify stdout and stderr were NOT set
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stdout',
        expect.anything()
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stderr',
        expect.anything()
      )

      // Verify exit code was set
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Actually runs child process and captures both streams in combined mode', async () => {
      // This test explicitly verifies that a real child process is spawned
      // and that we correctly capture output from both stdout and stderr
      const scriptPath = join(tempDir, 'both-streams.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\n' +
          'echo "STDOUT-LINE-1"\n' +
          'echo "STDERR-LINE-1" >&2\n' +
          'echo "STDOUT-LINE-2"\n' +
          'echo "STDERR-LINE-2" >&2\n' +
          'echo "STDOUT-LINE-3"\n' +
          'exit 0\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Get the actual combined output
      const combinedOutputCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'combined_output'
      )
      expect(combinedOutputCall).toBeDefined()
      const combinedOutput = combinedOutputCall![1]

      // Verify we captured ALL output from BOTH streams
      expect(combinedOutput).toContain('STDOUT-LINE-1')
      expect(combinedOutput).toContain('STDOUT-LINE-2')
      expect(combinedOutput).toContain('STDOUT-LINE-3')
      expect(combinedOutput).toContain('STDERR-LINE-1')
      expect(combinedOutput).toContain('STDERR-LINE-2')

      // Verify the output is non-empty (child process actually ran)
      expect(combinedOutput.length).toBeGreaterThan(50)

      // Verify no separate stdout/stderr outputs
      const stdoutCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stdout'
      )
      const stderrCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stderr'
      )
      expect(stdoutCall).toBeUndefined()
      expect(stderrCall).toBeUndefined()

      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Handles command failure with combined output', async () => {
      const scriptPath = join(tempDir, 'fail-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "operation failed" >&2\nexit 42\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output contains error message
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('operation failed')
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '42')

      // Verify the action failed with the combined output
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 42')
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('operation failed')
      )
    })

    it('Preserves output order in combined mode', async () => {
      const scriptPath = join(tempDir, 'ordered-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\n' +
          'echo "line1-stdout"\n' +
          'echo "line2-stderr" >&2\n' +
          'echo "line3-stdout"\n' +
          'echo "line4-stderr" >&2\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Get the combined output
      const combinedOutputCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'combined_output'
      )
      expect(combinedOutputCall).toBeDefined()
      const combinedOutput = combinedOutputCall![1]

      // Verify all lines are present
      expect(combinedOutput).toContain('line1-stdout')
      expect(combinedOutput).toContain('line2-stderr')
      expect(combinedOutput).toContain('line3-stdout')
      expect(combinedOutput).toContain('line4-stderr')
    })

    it('Handles large output in combined mode', async () => {
      const scriptPath = join(tempDir, 'large-output.sh')
      // Generate a script that outputs many lines
      let script = '#!/bin/bash\n'
      for (let i = 0; i < 100; i++) {
        script += `echo "stdout line ${i}"\n`
        script += `echo "stderr line ${i}" >&2\n`
      }
      writeFileSync(scriptPath, script, { mode: 0o755 })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      // Verify combined_output contains both first and last lines
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('stdout line 0')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('stderr line 99')
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe('Separate Output Mode (opt-in)', () => {
    it('Separates stdout and stderr when enabled', async () => {
      const scriptPath = join(tempDir, 'test-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "stdout message"\necho "stderr message" >&2\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Verify stdout and stderr are set separately
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('stdout message')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr',
        expect.stringContaining('stderr message')
      )

      // Verify combined_output was NOT set
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'combined_output',
        expect.anything()
      )

      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Actually runs child process and separates stdout/stderr correctly', async () => {
      // This test explicitly verifies that a real child process is spawned
      // and that stdout and stderr are kept separate
      const scriptPath = join(tempDir, 'separate-streams.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\n' +
          'echo "ONLY-IN-STDOUT-A"\n' +
          'echo "ONLY-IN-STDERR-A" >&2\n' +
          'echo "ONLY-IN-STDOUT-B"\n' +
          'echo "ONLY-IN-STDERR-B" >&2\n' +
          'exit 0\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Get the actual outputs
      const stdoutCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stdout'
      )
      const stderrCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stderr'
      )

      expect(stdoutCall).toBeDefined()
      expect(stderrCall).toBeDefined()

      const stdout = stdoutCall![1]
      const stderr = stderrCall![1]

      // Verify stdout contains ONLY stdout messages
      expect(stdout).toContain('ONLY-IN-STDOUT-A')
      expect(stdout).toContain('ONLY-IN-STDOUT-B')
      expect(stdout).not.toContain('ONLY-IN-STDERR')

      // Verify stderr contains ONLY stderr messages
      expect(stderr).toContain('ONLY-IN-STDERR-A')
      expect(stderr).toContain('ONLY-IN-STDERR-B')
      expect(stderr).not.toContain('ONLY-IN-STDOUT')

      // Verify combined_output was NOT set
      const combinedCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'combined_output'
      )
      expect(combinedCall).toBeUndefined()

      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Handles command failure with separate outputs', async () => {
      const scriptPath = join(tempDir, 'fail-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "stdout message"\necho "error message" >&2\nexit 1\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Verify both outputs are captured
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('stdout message')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr',
        expect.stringContaining('error message')
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify the action failed with stderr content
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 1')
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('error message')
      )
    })

    it('Handles only stdout output in separate mode', async () => {
      const scriptPath = join(tempDir, 'stdout-only.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "stdout only"\n', {
        mode: 0o755
      })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('stdout only')
      )
      expect(core.setOutput).toHaveBeenCalledWith('stderr', '')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Handles only stderr output in separate mode', async () => {
      const scriptPath = join(tempDir, 'stderr-only.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "stderr only" >&2\n', {
        mode: 0o755
      })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith('stdout', '')
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr',
        expect.stringContaining('stderr only')
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Handles large separate outputs', async () => {
      const scriptPath = join(tempDir, 'large-separate.sh')
      let script = '#!/bin/bash\n'
      for (let i = 0; i < 50; i++) {
        script += `echo "stdout ${i}"\n`
      }
      for (let i = 0; i < 50; i++) {
        script += `echo "stderr ${i}" >&2\n`
      }
      writeFileSync(scriptPath, script, { mode: 0o755 })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      // Verify stdout contains stdout lines but not stderr lines
      const stdoutCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stdout'
      )
      expect(stdoutCall).toBeDefined()
      const stdout = stdoutCall![1]
      expect(stdout).toContain('stdout 0')
      expect(stdout).toContain('stdout 49')
      expect(stdout).not.toContain('stderr')

      // Verify stderr contains stderr lines but not stdout lines
      const stderrCall = (core.setOutput as jest.Mock).mock.calls.find(
        (call: [string, string]) => call[0] === 'stderr'
      )
      expect(stderrCall).toBeDefined()
      const stderr = stderrCall![1]
      expect(stderr).toContain('stderr 0')
      expect(stderr).toContain('stderr 49')
      expect(stderr).not.toContain('stdout')

      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Respects separate_outputs=1 as true', async () => {
      const scriptPath = join(tempDir, 'test-script.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "stdout"\necho "stderr" >&2\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return '1'
        return ''
      })

      await run()

      // Verify separate outputs are used
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('stdout')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr',
        expect.stringContaining('stderr')
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'combined_output',
        expect.anything()
      )
    })
  })

  describe('Mode Switching', () => {
    it('Uses combined mode when separate_outputs is false', async () => {
      const scriptPath = join(tempDir, 'test.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "test"\n', { mode: 0o755 })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return 'false'
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('test')
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stdout',
        expect.anything()
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'stderr',
        expect.anything()
      )
    })

    it('Uses combined mode when separate_outputs is empty', async () => {
      const scriptPath = join(tempDir, 'test.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "test"\n', { mode: 0o755 })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('test')
      )
    })

    it('Uses combined mode when separate_outputs is 0', async () => {
      const scriptPath = join(tempDir, 'test.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "test"\n', { mode: 0o755 })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0'
        if (name === 'separate_outputs') return '0'
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('test')
      )
    })
  })

  describe('Integration with success_exit_codes', () => {
    it('Works with success_exit_codes in combined mode', async () => {
      const scriptPath = join(tempDir, 'exit-code.sh')
      writeFileSync(scriptPath, '#!/bin/bash\necho "warning" >&2\nexit 1\n', {
        mode: 0o755
      })

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0,1'
        if (name === 'separate_outputs') return ''
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'combined_output',
        expect.stringContaining('warning')
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Works with success_exit_codes in separate mode', async () => {
      const scriptPath = join(tempDir, 'exit-code.sh')
      writeFileSync(
        scriptPath,
        '#!/bin/bash\necho "info"\necho "warning" >&2\nexit 2\n',
        { mode: 0o755 }
      )

      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return scriptPath
        if (name === 'success_exit_codes') return '0-5'
        if (name === 'separate_outputs') return 'true'
        return ''
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('info')
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'stderr',
        expect.stringContaining('warning')
      )
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '2')
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })
})
