/**
 * Tests to ensure Node.js version consistency across the repository.
 * All Node.js version specifications must align with the runtime specified in action.yml.
 */

import { describe, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getNodeMajorVersion } from '../script/get-node-version.js'

// Get the directory of this test file
const testDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(testDir, '..')

describe('Node.js Version Consistency', () => {
  const expectedMajorVersion = getNodeMajorVersion()

  test('should extract Node.js major version from action.yml', () => {
    expect(expectedMajorVersion).toBeGreaterThan(0)
    expect(expectedMajorVersion).toBeLessThan(100)
  })

  test('@types/node major version should match action.yml runtime', () => {
    const packageJsonPath = resolve(rootDir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    const typesNodeVersion = packageJson.devDependencies['@types/node']
    expect(typesNodeVersion).toBeDefined()

    // Extract major version from @types/node version string
    // Format could be: ^24.0.0, ~24.0.0, 24.0.0, etc.
    const match = typesNodeVersion.match(/[~^]?(\d+)\.\d+\.\d+/)
    expect(match).not.toBeNull()

    const typesNodeMajor = parseInt(match[1], 10)
    expect(typesNodeMajor).toBe(expectedMajorVersion)
  })

  test('dependabot should be configured to ignore @types/node major version upgrades', () => {
    const dependabotYmlPath = resolve(rootDir, '.github/dependabot.yml')
    const dependabotYml = readFileSync(dependabotYmlPath, 'utf-8')

    // Check that dependabot has an ignore rule for @types/node major upgrades
    expect(dependabotYml).toMatch(/dependency-name:\s*['"]?@types\/node['"]?/)
    expect(dependabotYml).toMatch(/version-update:semver-major/)
  })

  test('package.json engines.node should require minimum major version without maximum', () => {
    const packageJsonPath = resolve(rootDir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    const nodeEngine = packageJson.engines?.node
    expect(nodeEngine).toBeDefined()

    // Should start with >= and include the expected major version
    expect(nodeEngine).toMatch(new RegExp(`^>=\\s*${expectedMajorVersion}\\.`))

    // Should not have a maximum constraint (no < or <=)
    expect(nodeEngine).not.toMatch(/</)
  })

  test('.node-version should specify the major version only', () => {
    const nodeVersionPath = resolve(rootDir, '.node-version')
    const nodeVersion = readFileSync(nodeVersionPath, 'utf-8').trim()

    // Should be just the major version number
    expect(nodeVersion).toBe(expectedMajorVersion.toString())
  })

  test('devcontainer should use Node.js major version matching action.yml', () => {
    const devcontainerPath = resolve(rootDir, '.devcontainer/devcontainer.json')
    const devcontainerJson = readFileSync(devcontainerPath, 'utf-8')

    // Check that the devcontainer image uses the correct Node.js version
    const imageMatch = devcontainerJson.match(
      /typescript-node:(\d+)|node:(\d+)/
    )
    expect(imageMatch).not.toBeNull()

    const imageMajorVersion = parseInt(imageMatch[1] || imageMatch[2], 10)
    expect(imageMajorVersion).toBe(expectedMajorVersion)
  })
})
