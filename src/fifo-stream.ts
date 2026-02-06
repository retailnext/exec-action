/**
 * FIFO-based stream for combining stdout and stderr into a single output stream.
 *
 * This module provides functionality to create a named pipe (FIFO) that can be
 * used to merge stdout and stderr from a child process while preserving the
 * natural interleaving of output.
 */

import { createReadStream } from 'fs'
import { mkdirSync, openSync, unlinkSync, closeSync } from 'fs'
import { dirname } from 'path'
import * as core from '@actions/core'
import { execSync } from 'child_process'
import { Readable } from 'stream'

/**
 * Represents a FIFO pipe that can be used for combined output.
 */
export class FifoPipe {
  private fifoPath: string
  private reader: Readable | null = null
  private writeFd: number | null = null
  private combinedOutput: string = ''
  private readerEnded: boolean = false
  private fifoUnlinked: boolean = false
  private isOpen: boolean = false

  /**
   * Creates a new FIFO pipe.
   * @param fifoPath - Path where the FIFO should be created
   */
  constructor(fifoPath: string) {
    this.fifoPath = fifoPath
  }

  /**
   * Opens the FIFO pipe for reading and writing.
   * Returns the file descriptor that should be passed to the child process.
   * @returns Promise that resolves with the write file descriptor
   */
  async open(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      try {
        // Create directory for FIFO if it doesn't exist
        core.debug(`[FIFO] Creating directory: ${dirname(this.fifoPath)}`)
        mkdirSync(dirname(this.fifoPath), { recursive: true })

        // Create the FIFO
        core.debug(`[FIFO] Creating FIFO at: ${this.fifoPath}`)
        execSync(`mkfifo "${this.fifoPath}"`)
        core.debug('[FIFO] FIFO created')

        // Open the FIFO for reading (non-blocking)
        core.debug('[FIFO] Opening reader')
        this.reader = createReadStream(this.fifoPath, { flags: 'r' })
        core.debug('[FIFO] Reader opened')

        this.reader.on('data', (data: Buffer) => {
          const text = data.toString()
          core.debug(`[FIFO] Received data: ${text.length} bytes`)
          this.combinedOutput += text
          core.debug(
            `[FIFO] combinedOutput is now: ${this.combinedOutput.length} bytes`
          )
          process.stdout.write(text)
        })

        this.reader.on('end', () => {
          core.debug('[FIFO] Reader ended')
          this.readerEnded = true
        })

        this.reader.on('error', (error: Error) => {
          core.debug(`[FIFO] Reader error: ${error.message}`)
          reject(error)
        })

        // Open the FIFO for writing after a small delay to ensure reader is ready
        core.debug('[FIFO] Scheduling writer open in 50ms')
        setTimeout(() => {
          try {
            core.debug('[FIFO] Opening writer')
            this.writeFd = openSync(this.fifoPath, 'w')
            core.debug(`[FIFO] Writer opened with fd ${this.writeFd}`)

            // Unlink the FIFO immediately after both ends are open
            core.debug('[FIFO] Unlinking FIFO')
            unlinkSync(this.fifoPath)
            this.fifoUnlinked = true
            core.debug('[FIFO] FIFO unlinked')

            this.isOpen = true
            resolve(this.writeFd)
          } catch (error) {
            core.debug(`[FIFO] Error opening writer: ${error}`)
            this.cleanup()
            reject(error)
          }
        }, 50)
      } catch (error) {
        core.debug(`[FIFO] Error in open: ${error}`)
        this.cleanup()
        reject(error)
      }
    })
  }

  /**
   * Gets the combined output captured so far.
   */
  getOutput(): string {
    return this.combinedOutput
  }

  /**
   * Waits for the reader to finish receiving all data.
   * @param timeout - Maximum time to wait in milliseconds (default: 200)
   * @returns Promise that resolves when reader has ended or timeout occurs
   */
  async waitForCompletion(timeout: number = 200): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.readerEnded) {
        core.debug('[FIFO] Reader already ended')
        resolve()
        return
      }

      core.debug('[FIFO] Waiting for reader to end...')
      let waited = 0
      const checkInterval = setInterval(() => {
        waited += 10
        if (this.readerEnded) {
          core.debug(`[FIFO] Reader ended after ${waited}ms`)
          clearInterval(checkInterval)
          resolve()
        } else if (waited >= timeout) {
          core.debug(
            `[FIFO] Reader did not end after ${waited}ms, continuing anyway`
          )
          clearInterval(checkInterval)
          resolve()
        }
      }, 10)
    })
  }

  /**
   * Closes the write file descriptor and cleans up resources.
   */
  close(): void {
    core.debug('[FIFO] Closing')

    // Close the write fd
    if (this.writeFd !== null) {
      try {
        core.debug('[FIFO] Closing write fd')
        closeSync(this.writeFd)
        this.writeFd = null
        core.debug('[FIFO] Write fd closed')
      } catch (err) {
        core.debug(`[FIFO] Error closing write fd: ${err}`)
      }
    }

    // Destroy the reader
    if (this.reader) {
      this.reader.destroy()
      this.reader = null
    }

    this.isOpen = false
  }

  /**
   * Cleans up resources without waiting. Used for error cases.
   */
  private cleanup(): void {
    if (this.reader) {
      this.reader.destroy()
      this.reader = null
    }

    if (this.writeFd !== null) {
      try {
        closeSync(this.writeFd)
      } catch {
        // Ignore errors during cleanup
      }
      this.writeFd = null
    }

    // Clean up FIFO only if it wasn't successfully unlinked
    if (!this.fifoUnlinked) {
      try {
        unlinkSync(this.fifoPath)
      } catch {
        // Ignore unlink errors in cleanup
      }
    }

    this.isOpen = false
  }

  /**
   * Closes the write FD used by signal handlers without destroying the reader.
   */
  closeWriteFd(): void {
    if (this.writeFd !== null) {
      try {
        closeSync(this.writeFd)
        this.writeFd = null
      } catch (err) {
        core.debug(`[FIFO] Error closing write fd in signal cleanup: ${err}`)
      }
    }
  }

  /**
   * Returns whether the pipe is currently open.
   */
  isOpened(): boolean {
    return this.isOpen
  }
}
