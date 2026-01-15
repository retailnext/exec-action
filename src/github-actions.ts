/**
 * Local implementations of GitHub Actions functions.
 * These replace the @actions/core dependency with zero external dependencies.
 */

import { appendFileSync } from 'fs'

/**
 * Gets the value of an input. The value is retrieved from the environment
 * variable INPUT_<name> (converted to uppercase).
 *
 * @param name Name of the input to get
 * @param options Optional. If required is true, will throw if input is not set
 * @returns string
 */
export function getInput(
  name: string,
  options?: { required?: boolean }
): string {
  const envName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
  const val = process.env[envName] || ''

  if (options?.required && !val) {
    throw new Error(`Input required and not supplied: ${name}`)
  }

  return val.trim()
}

/**
 * Sets the value of an output by writing to the GITHUB_OUTPUT file.
 *
 * @param name Name of the output to set
 * @param value Value to set
 */
export function setOutput(name: string, value: string): void {
  const outputFile = process.env['GITHUB_OUTPUT']
  if (!outputFile) {
    // In local development without GitHub Actions environment
    return
  }

  // Format: name=value (with proper escaping for multiline values)
  const delimiter = `ghadelimiter_${Math.random().toString(36).substring(2)}`
  const output = `${name}<<${delimiter}\n${value}\n${delimiter}\n`

  appendFileSync(outputFile, output, { encoding: 'utf8' })
}

/**
 * Writes debug message to stdout using GitHub Actions workflow command format.
 *
 * @param message Debug message
 */
export function debug(message: string): void {
  process.stdout.write(`::debug::${message}\n`)
}

/**
 * Sets the action status to failed. Writes an error message and exits the process.
 *
 * @param message Error message
 */
export function setFailed(message: string): void {
  process.exitCode = 1
  process.stdout.write(`::error::${message}\n`)
}
