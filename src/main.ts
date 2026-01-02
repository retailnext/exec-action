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

    core.debug(`Executing command: ${command}`)

    // Execute the command and capture outputs
    const result = await executeCommand(command)

    // Set outputs for other workflow steps to use
    core.setOutput('stdout', result.stdout)
    core.setOutput('stderr', result.stderr)
    core.setOutput('exit_code', result.exitCode.toString())

    // If the command failed, mark the action as failed
    if (result.exitCode !== 0) {
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
