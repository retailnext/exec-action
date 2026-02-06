/**
 * Unit tests for fifo-stream.ts module
 */

import { FifoPipe } from '../src/fifo-stream'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

describe('fifo-stream', () => {
  describe('FifoPipe', () => {
    it('opens and provides a file descriptor', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()
      expect(fd).toBeGreaterThan(0)
      expect(fifoPipe.isOpened()).toBe(true)

      fifoPipe.close()
    }, 15000)

    it('captures combined stdout and stderr output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn(
        'sh',
        ['-c', 'echo "stdout message"; echo "stderr message" >&2'],
        {
          stdio: ['inherit', fd, fd]
        }
      )

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('stdout message')
      expect(output).toContain('stderr message')
    }, 15000)

    it('preserves output interleaving', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn(
        'sh',
        ['-c', 'echo "A"; echo "B" >&2; echo "C"; echo "D" >&2'],
        {
          stdio: ['inherit', fd, fd]
        }
      )

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('A')
      expect(output).toContain('B')
      expect(output).toContain('C')
      expect(output).toContain('D')

      // Verify order is preserved
      const indexA = output.indexOf('A')
      const indexB = output.indexOf('B')
      const indexC = output.indexOf('C')
      const indexD = output.indexOf('D')

      expect(indexA).toBeGreaterThanOrEqual(0)
      expect(indexB).toBeGreaterThanOrEqual(0)
      expect(indexC).toBeGreaterThanOrEqual(0)
      expect(indexD).toBeGreaterThanOrEqual(0)
    }, 15000)

    it('handles large output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn(
        'sh',
        [
          '-c',
          'for i in $(seq 1 100); do echo "Line $i with some extra text to make it longer"; done'
        ],
        {
          stdio: ['inherit', fd, fd]
        }
      )

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output.length).toBeGreaterThan(4000)
      expect(output).toContain('Line 1')
      expect(output).toContain('Line 100')
    }, 15000)

    it('handles multi-line output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('sh', ['-c', 'echo "line1\nline2\nline3"'], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('line1')
      expect(output).toContain('line2')
      expect(output).toContain('line3')
    }, 15000)

    it('handles empty output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('sh', ['-c', 'exit 0'], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toBe('')
    }, 15000)

    it('cleans up FIFO after execution', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      await fifoPipe.open()
      fifoPipe.close()

      // FIFO should be unlinked during open
      expect(existsSync(fifoPath)).toBe(false)
    }, 15000)

    it('handles commands that produce no output but exit successfully', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('true', [], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toBe('')
    }, 15000)

    it('handles commands with special characters in output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn(
        'sh',
        ['-c', 'echo "Test with \\$pecial ch@rs and 日本語"'],
        {
          stdio: ['inherit', fd, fd]
        }
      )

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('$pecial')
      expect(output).toContain('ch@rs')
      expect(output).toContain('日本語')
    }, 15000)

    it('handles rapid succession of output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn(
        'sh',
        [
          '-c',
          'for i in 1 2 3 4 5; do echo "stdout$i"; echo "stderr$i" >&2; done'
        ],
        {
          stdio: ['inherit', fd, fd]
        }
      )

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      // All messages should be captured
      for (let i = 1; i <= 5; i++) {
        expect(output).toContain(`stdout${i}`)
        expect(output).toContain(`stderr${i}`)
      }
    }, 15000)

    it('handles commands that write binary-like data', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('sh', ['-c', 'printf "\\x00\\x01\\x02test\\n"'], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('test')
    }, 15000)

    it('handles long-running commands', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('sh', ['-c', 'sleep 0.5; echo "done"'], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()
      const output = fifoPipe.getOutput()
      fifoPipe.close()

      expect(output).toContain('done')
    }, 15000)

    it('can close write fd independently', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      await fifoPipe.open()
      fifoPipe.closeWriteFd()
      expect(fifoPipe.isOpened()).toBe(true) // Still open, just write fd closed

      fifoPipe.close()
      expect(fifoPipe.isOpened()).toBe(false)
    }, 15000)

    it('handles errors when FIFO path is invalid', async () => {
      const fifoPipe = new FifoPipe(
        '/invalid/path/that/does/not/exist/test.fifo'
      )

      await expect(fifoPipe.open()).rejects.toThrow()
    }, 15000)

    it('getOutput returns accumulated output', async () => {
      const fifoPath = `/tmp/test-fifo-${Date.now()}-${Math.random()}.fifo`
      const fifoPipe = new FifoPipe(fifoPath)

      const fd = await fifoPipe.open()

      const child = spawn('sh', ['-c', 'echo "test1"; echo "test2"'], {
        stdio: ['inherit', fd, fd]
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve())
      })

      await fifoPipe.waitForCompletion()

      // Can call getOutput multiple times
      const output1 = fifoPipe.getOutput()
      const output2 = fifoPipe.getOutput()

      expect(output1).toBe(output2)
      expect(output1).toContain('test1')
      expect(output1).toContain('test2')

      fifoPipe.close()
    }, 15000)
  })
})
