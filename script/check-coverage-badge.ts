/**
 * Utility script to verify that the coverage badge is up to date
 * This compares the coverage percentage in the badge SVG with the actual coverage from Jest
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Extracts the coverage percentage from the coverage-summary.json file
 * @returns The statement coverage percentage as a number
 * @throws Error if coverage file cannot be found or parsed
 */
export function getCoverageFromSummary(): number {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const coveragePath = resolve(scriptDir, '../coverage/coverage-summary.json')

  if (!existsSync(coveragePath)) {
    throw new Error(
      'Coverage summary not found. Run "npm run test" to generate coverage data.'
    )
  }

  const coverageData = JSON.parse(readFileSync(coveragePath, 'utf-8'))

  if (!coverageData.total || !coverageData.total.statements) {
    throw new Error('Invalid coverage summary format')
  }

  return coverageData.total.statements.pct
}

/**
 * Extracts the coverage percentage from the coverage badge SVG file
 * @returns The coverage percentage as a number
 * @throws Error if badge file cannot be found or parsed
 */
export function getCoverageFromBadge(): number {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const badgePath = resolve(scriptDir, '../badges/coverage.svg')

  if (!existsSync(badgePath)) {
    throw new Error(
      'Coverage badge not found. Run "npm run coverage" to generate the badge.'
    )
  }

  const badgeContent = readFileSync(badgePath, 'utf-8')

  // Extract the coverage percentage from the badge SVG
  // The format is: <text ...>XX.XX%</text>
  const match = badgeContent.match(/(\d+\.?\d*)%<\/text>/)

  if (!match) {
    throw new Error('Could not extract coverage percentage from badge')
  }

  return parseFloat(match[1])
}

/**
 * Validates that the coverage badge matches the actual coverage
 * @throws Error if badge is out of date
 */
export function validateCoverageBadge(): void {
  const actualCoverage = getCoverageFromSummary()
  const badgeCoverage = getCoverageFromBadge()

  console.log(`Actual coverage: ${actualCoverage}%`)
  console.log(`Badge coverage: ${badgeCoverage}%`)

  if (actualCoverage !== badgeCoverage) {
    throw new Error(
      `Coverage badge is out of date!\n` +
        `  Actual coverage: ${actualCoverage}%\n` +
        `  Badge coverage: ${badgeCoverage}%\n` +
        `  Run "npm run coverage" to update the badge.`
    )
  }

  console.log('✓ Coverage badge is up to date')
}

// If run directly as a script, validate the badge
const isMainModule =
  fileURLToPath(import.meta.url) === process.argv[1] ||
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  try {
    validateCoverageBadge()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
