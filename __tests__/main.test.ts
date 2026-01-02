/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run, executeCommand } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('run', () => {
    it('Executes a successful command and sets outputs', async () => {
      core.getInput.mockReturnValue('echo "Hello World"')

      await run()

      // Verify outputs were set
      expect(core.setOutput).toHaveBeenCalledWith(
        'stdout',
        expect.stringContaining('Hello World')
      )
      expect(core.setOutput).toHaveBeenCalledWith('stderr', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '0')

      // Verify the action did not fail
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('Sets a failed status when command fails', async () => {
      core.getInput.mockReturnValue('exit 1')

      await run()

      // Verify outputs were set
      expect(core.setOutput).toHaveBeenCalledWith('stdout', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('stderr', expect.any(String))
      expect(core.setOutput).toHaveBeenCalledWith('exit_code', '1')

      // Verify that the action was marked as failed
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Command exited with code 1')
      )
    })

    it('Handles execution errors', async () => {
      // Use a command that will cause an error
      core.getInput.mockReturnValue('this-command-does-not-exist-and-will-fail')

      await run()

      // Verify that the action was marked as failed
      expect(core.setFailed).toHaveBeenCalled()
    })
  })

  describe('executeCommand', () => {
    it('Captures stdout from a command', async () => {
      const result = await executeCommand('echo "test output"')

      expect(result.stdout).toContain('test output')
      expect(result.exitCode).toBe(0)
    })

    it('Captures stderr from a command', async () => {
      const result = await executeCommand('>&2 echo "error output"')

      expect(result.stderr).toContain('error output')
      expect(result.exitCode).toBe(0)
    })

    it('Captures exit code from a failed command', async () => {
      const result = await executeCommand('exit 42')

      expect(result.exitCode).toBe(42)
    })

    it('Handles multi-line output', async () => {
      const result = await executeCommand('echo "line1" && echo "line2"')

      expect(result.stdout).toContain('line1')
      expect(result.stdout).toContain('line2')
      expect(result.exitCode).toBe(0)
    })
  })
})
