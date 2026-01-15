import type * as core from '../src/github-actions.js'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
