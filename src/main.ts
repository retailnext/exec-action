import { spawn, execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, createReadStream, openSync, closeSync } from 'fs'
import * as core from './github-actions.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const command: string = core.getInput('command', { required: true })
    const successExitCodesInput: string = core.getInput('success_exit_codes')
    const separateOutputsInput: string = core.getInput('separate_outputs')

    core.debug(`Executing command: ${command}`)
    core.debug(`Success exit codes: ${successExitCodesInput}`)
    core.debug(`Separate outputs: ${separateOutputsInput}`)

    // Parse inputs
    const successExitCodes = parseSuccessExitCodes(successExitCodesInput)
    // Default to false (combined outputs)
    const separateOutputs =
      separateOutputsInput.toLowerCase() === 'true' ||
      separateOutputsInput === '1'

    // Execute the command and capture outputs
    const result = await executeCommand(command, separateOutputs)

    // Set outputs based on separate_outputs flag
    if (separateOutputs) {
      core.setOutput('stdout', result.stdout)
      core.setOutput('stderr', result.stderr)
    } else {
      core.setOutput('combined_output', result.combinedOutput)
    }
    core.setOutput('exit_code', result.exitCode.toString())

    // Check if the exit code should be treated as success
    if (!successExitCodes.has(result.exitCode)) {
      const errorOutput = separateOutputs
        ? result.stderr || result.stdout
        : result.combinedOutput
      core.setFailed(
        `Command exited with code ${result.exitCode}: ${errorOutput}`
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
 * @param separateOutputs Whether to capture stdout and stderr separately.
 * @returns A promise that resolves with stdout, stderr, combinedOutput, and exit code.
 */
export async function executeCommand(
  command: string,
  separateOutputs: boolean = false
): Promise<{
  stdout: string
  stderr: string
  combinedOutput: string
  exitCode: number
}> {
  return new Promise((resolve, reject) => {
    // Parse command into executable and arguments
    const args = parseCommand(command)
    if (args.length === 0) {
      reject(new Error('Command cannot be empty'))
      return
    }

    const executable = args[0]
    const commandArgs = args.slice(1)

    let stdout = ''
    let stderr = ''
    let combinedOutput = ''
    let settled = false

    if (separateOutputs) {
      // Separate mode: use two different pipes for stdout and stderr
      const child = spawn(executable, commandArgs, {
        stdio: ['inherit', 'pipe', 'pipe']
      })

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

      // Forward signals and handle process lifecycle
      setupSignalHandlers(child, () => {
        if (!settled) {
          settled = true
          resolve({
            stdout,
            stderr,
            combinedOutput,
            exitCode: 0
          })
        }
      })

      child.on('error', (error: Error) => {
        if (!settled) {
          settled = true
          reject(error)
        }
      })

      child.on('close', (code: number | null) => {
        if (!settled) {
          settled = true
          resolve({
            stdout,
            stderr,
            combinedOutput,
            exitCode: code ?? 0
          })
        }
      })
    } else {
      // Combined mode: create a FIFO (named pipe) and pass it to both stdout and stderr
      // Note: Node.js doesn't expose pipe() syscall for anonymous pipes,
      // so we use mkfifo to create a named pipe which provides the same behavior
      const fifoPath = join(
        tmpdir(),
        `exec-action-${Date.now()}-${Math.random().toString(36).slice(2)}.fifo`
      )

      try {
        // Create a FIFO (named pipe)
        execSync(`mkfifo "${fifoPath}"`)

        // Track if reader has ended
        let readerEnded = false

        // Open the FIFO for reading (non-blocking)
        const reader = createReadStream(fifoPath, { flags: 'r' })

        reader.on('data', (data: Buffer) => {
          const text = data.toString()
          combinedOutput += text
          process.stdout.write(text)
        })

        reader.on('end', () => {
          readerEnded = true
        })

        reader.on('error', (error: Error) => {
          if (!settled) {
            settled = true
            reader.destroy()
            try {
              unlinkSync(fifoPath)
            } catch (e) {
              // Ignore cleanup errors
            }
            reject(error)
          }
        })

        // Open the FIFO for writing after a small delay to ensure reader is ready
        // This prevents the open call from blocking
        setTimeout(() => {
          let writeFd: number | null = null

          try {
            writeFd = openSync(fifoPath, 'w')

            // Unlink the FIFO immediately after both ends are open
            // The file descriptors will continue to work until closed
            try {
              unlinkSync(fifoPath)
            } catch (e) {
              // Ignore if already unlinked
            }

            // Spawn with the same fd for both stdout and stderr
            const child = spawn(executable, commandArgs, {
              stdio: ['inherit', writeFd, writeFd]
            })

            // Set up signal handlers
            setupSignalHandlers(child, () => {
              if (!settled) {
                settled = true
                if (writeFd !== null) {
                  try {
                    closeSync(writeFd)
                  } catch (e) {
                    // Ignore close errors
                  }
                }
                reader.destroy()
              }
            })

            child.on('error', (error: Error) => {
              if (!settled) {
                settled = true
                if (writeFd !== null) {
                  try {
                    closeSync(writeFd)
                  } catch (e) {
                    // Ignore close errors
                  }
                }
                reader.destroy()
                reject(error)
              }
            })

            child.on('close', (code: number | null) => {
              if (!settled) {
                settled = true

                // Close the write fd first
                if (writeFd !== null) {
                  try {
                    closeSync(writeFd)
                    writeFd = null
                  } catch (e) {
                    // Ignore close errors
                  }
                }

                // Function to finalize and resolve
                const finalize = () => {
                  reader.destroy()
                  resolve({
                    stdout,
                    stderr,
                    combinedOutput,
                    exitCode: code ?? 0
                  })
                }

                // If reader has already ended, finalize immediately
                // Otherwise wait a bit for final data
                if (readerEnded) {
                  finalize()
                } else {
                  setTimeout(finalize, 50)
                }
              }
            })
          } catch (error) {
            if (!settled) {
              settled = true
              if (writeFd !== null) {
                try {
                  closeSync(writeFd)
                } catch (e) {
                  // Ignore close errors
                }
              }
              reader.destroy()
              try {
                unlinkSync(fifoPath)
              } catch (e) {
                // Ignore cleanup errors
              }
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          }
        }, 50)
      } catch (error) {
        if (!settled) {
          settled = true
          try {
            unlinkSync(fifoPath)
          } catch (e) {
            // Ignore cleanup errors
          }
          reject(
            error instanceof Error
              ? error
              : new Error(`Failed to create FIFO: ${error}`)
          )
        }
      }
    }
  })
}

/**
 * Set up signal forwarding for a child process.
 *
 * @param child The child process to forward signals to.
 * @param cleanup Cleanup function to call when removing handlers.
 */
function setupSignalHandlers(
  child: ReturnType<typeof spawn>,
  cleanup: () => void
): void {
  const signals: NodeJS.Signals[] = [
    'SIGINT',
    'SIGTERM',
    'SIGQUIT',
    'SIGHUP',
    'SIGPIPE',
    'SIGABRT'
  ]

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
    cleanup()
  }

  child.on('close', cleanupSignalHandlers)
  child.on('error', cleanupSignalHandlers)
}

/**
 * Parse a command string into an array of arguments.
 * Handles quoted strings and escapes.
 *
 * @param command The command string to parse.
 * @returns An array of arguments.
 */
export function parseCommand(command: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes: string | null = null
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (inQuotes) {
      if (char === inQuotes) {
        inQuotes = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuotes = char
    } else if (char === ' ' || char === '\t' || char === '\n') {
      if (current.length > 0) {
        args.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  // Handle edge cases
  if (escaped) {
    throw new Error('Invalid command: ends with an incomplete escape sequence')
  }

  if (inQuotes) {
    throw new Error(`Invalid command: unclosed quote (${inQuotes})`)
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}
