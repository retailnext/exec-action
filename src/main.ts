import * as core from '@actions/core'
import { spawn } from 'child_process'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const command: string = core.getInput('command', { required: true })
    const successExitCodesInput: string = core.getInput('success_exit_codes')

    core.debug(`Executing command: ${command}`)
    core.debug(`Success exit codes: ${successExitCodesInput}`)

    // Parse success exit codes
    const successExitCodes = parseSuccessExitCodes(successExitCodesInput)

    // Execute the command and capture outputs
    const result = await executeCommand(command)

    // Set outputs for other workflow steps to use
    core.setOutput('stdout', result.stdout)
    core.setOutput('stderr', result.stderr)
    core.setOutput('exit_code', result.exitCode.toString())

    // Check if the exit code should be treated as success
    if (!successExitCodes.has(result.exitCode)) {
      core.setFailed(
        `Command exited with code ${result.exitCode}: ${result.stderr || result.stdout}`
      )
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

/**
 * Parse the success exit codes input.
 * Supports individual codes (e.g., "0,1,2") and ranges (e.g., "0-2,5,10-15").
 *
 * @param input The success exit codes input string.
 * @returns A Set of exit codes that should be treated as success.
 */
export function parseSuccessExitCodes(input: string): Set<number> {
  const exitCodes = new Set<number>()

  if (!input || input.trim() === '') {
    exitCodes.add(0)
    return exitCodes
  }

  const parts = input.split(',').map((part) => part.trim())

  for (const part of parts) {
    if (part.includes('-')) {
      // Parse range (e.g., "0-2")
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)

      if (isNaN(start) || isNaN(end)) {
        throw new Error(
          `Invalid range format: "${part}". Expected format: "start-end" (e.g., "0-2")`
        )
      }

      if (start < 0 || end < 0) {
        throw new Error(
          `Invalid range: "${part}". Exit codes must be non-negative integers`
        )
      }

      if (start > end) {
        throw new Error(
          `Invalid range: "${part}". Start (${start}) must be less than or equal to end (${end})`
        )
      }

      for (let i = start; i <= end; i++) {
        exitCodes.add(i)
      }
    } else {
      // Parse individual code
      const code = parseInt(part, 10)
      if (isNaN(code)) {
        throw new Error(
          `Invalid exit code: "${part}". Expected a number or range (e.g., "0" or "0-2")`
        )
      }

      if (code < 0) {
        throw new Error(
          `Invalid exit code: "${part}". Exit codes must be non-negative integers`
        )
      }

      exitCodes.add(code)
    }
  }

  return exitCodes
}

/**
 * Execute a command and capture its output.
 *
 * @param command The command to execute.
 * @returns A promise that resolves with stdout, stderr, and exit code.
 */
export async function executeCommand(command: string): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  return new Promise((resolve, reject) => {
    // Use shell to execute the command
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    // Capture and stream stdout
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        stdout += text
        process.stdout.write(text)
      })
    }

    // Capture and stream stderr
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        process.stderr.write(text)
      })
    }

    // Forward signals to the child process
    const signals: NodeJS.Signals[] = [
      'SIGINT',
      'SIGTERM',
      'SIGQUIT',
      'SIGHUP',
      'SIGPIPE',
      'SIGABRT'
    ]

    // Create individual signal handlers for proper cleanup
    const signalHandlers = new Map<NodeJS.Signals, () => void>()
    for (const signal of signals) {
      const handler = () => {
        core.debug(`Received ${signal}, forwarding to child process`)
        child.kill(signal)
      }
      signalHandlers.set(signal, handler)
      process.on(signal, handler)
    }

    // Clean up signal handlers when child closes
    const cleanupSignalHandlers = () => {
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler)
      }
      signalHandlers.clear()
    }

    // Handle process exit
    child.on('close', (code: number | null) => {
      cleanupSignalHandlers()
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0
      })
    })

    // Handle errors
    child.on('error', (error: Error) => {
      cleanupSignalHandlers()
      reject(error)
    })
  })
}
