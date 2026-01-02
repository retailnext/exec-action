#!/usr/bin/env tsx

/**
 * Test script that prints the time every second and handles signals.
 * This is used to test signal forwarding in the action.
 */

let running = true
let signalReceived: NodeJS.Signals | null = null

// Handle signals
const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGHUP', 'SIGINT', 'SIGQUIT']

for (const signal of signals) {
  process.on(signal, () => {
    signalReceived = signal
    console.log(
      `\n[signal-test] Received ${signal}, shutting down gracefully...`
    )
    running = false
  })
}

// Get duration from command line args (default to 60 seconds)
const duration = parseInt(process.argv[2] || '60', 10)
const startTime = Date.now()

console.log(
  `[signal-test] Starting test script, will run for ${duration} seconds`
)
console.log('[signal-test] Press Ctrl+C or send SIGTERM to stop early')

// Main loop - print time every second
const interval = setInterval(() => {
  if (!running) {
    clearInterval(interval)
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    console.log(
      `[signal-test] Exited after ${elapsed} seconds due to ${signalReceived}`
    )
    process.exit(0)
    return
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const now = new Date().toISOString()
  console.log(`[signal-test] [${elapsed}s] Current time: ${now}`)

  // Check if we've reached the duration
  if (elapsed >= duration) {
    console.log(`[signal-test] Reached ${duration} seconds, exiting normally`)
    clearInterval(interval)
    process.exit(0)
  }
}, 1000)

// Handle uncaught errors
process.on('uncaughtException', (err: Error) => {
  console.error('[signal-test] Uncaught exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (err: Error) => {
  console.error('[signal-test] Unhandled rejection:', err)
  process.exit(1)
})
