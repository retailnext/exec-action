/**
 * Utility script to extract the Node.js major version from action.yml
 * This is used by tests to ensure version consistency across the repository
 */

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Extracts the Node.js major version from action.yml
 * @returns The major version number extracted from the runtime specification
 * @throws Error if action.yml cannot be parsed or runtime is not found
 */
export function getNodeMajorVersion(): number {
  // Get the directory of this script
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const actionYmlPath = resolve(scriptDir, '../action.yml')
  const actionYml = readFileSync(actionYmlPath, 'utf-8')

  // Look for "using: nodeXX" in the runs section
  const match = actionYml.match(/^\s*using:\s*node(\d+)\s*$/m)

  if (!match) {
    throw new Error(
      'Could not find runs.using with nodeXX format in action.yml'
    )
  }

  return parseInt(match[1], 10)
}

// If run directly as a script, print the version
const isMainModule =
  fileURLToPath(import.meta.url) === process.argv[1] ||
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  try {
    console.log(getNodeMajorVersion())
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
