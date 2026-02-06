import { spawn, execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendFileSync, createReadStream, openSync, unlinkSync, closeSync } from 'fs';

/**
 * Local implementations of GitHub Actions functions.
 * These replace the @actions/core dependency with zero external dependencies.
 */
/**
 * Gets the value of an input. The value is retrieved from the environment
 * variable INPUT_<name> (converted to uppercase).
 *
 * @param name Name of the input to get
 * @param options Optional. If required is true, will throw if input is not set
 * @returns string
 */
function getInput(name, options) {
    const envName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
    const val = process.env[envName] || '';
    if (options?.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    return val.trim();
}
/**
 * Sets the value of an output by writing to the GITHUB_OUTPUT file.
 *
 * @param name Name of the output to set
 * @param value Value to set
 */
function setOutput(name, value) {
    const outputFile = process.env['GITHUB_OUTPUT'];
    if (!outputFile) {
        // In local development without GitHub Actions environment
        return;
    }
    // Format: name=value (with proper escaping for multiline values)
    // Use timestamp + random to ensure uniqueness
    const delimiter = `ghadelimiter_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const output = `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
    appendFileSync(outputFile, output, { encoding: 'utf8' });
}
/**
 * Writes debug message to stdout using GitHub Actions workflow command format.
 *
 * @param message Debug message
 */
function debug(message) {
    process.stdout.write(`::debug::${message}\n`);
}
/**
 * Sets the action status to failed. Writes an error message and exits the process.
 *
 * @param message Error message
 */
function setFailed(message) {
    process.exitCode = 1;
    process.stdout.write(`::error::${message}\n`);
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
async function run() {
    try {
        const command = getInput('command', { required: true });
        const successExitCodesInput = getInput('success_exit_codes');
        const separateOutputsInput = getInput('separate_outputs');
        debug(`Executing command: ${command}`);
        debug(`Success exit codes: ${successExitCodesInput}`);
        debug(`Separate outputs: ${separateOutputsInput}`);
        // Parse inputs
        const successExitCodes = parseSuccessExitCodes(successExitCodesInput);
        // Default to false (combined outputs)
        const separateOutputs = separateOutputsInput.toLowerCase() === 'true' ||
            separateOutputsInput === '1';
        // Execute the command and capture outputs
        const result = await executeCommand(command, separateOutputs);
        // Set outputs based on separate_outputs flag
        if (separateOutputs) {
            setOutput('stdout', result.stdout);
            setOutput('stderr', result.stderr);
        }
        else {
            setOutput('combined_output', result.combinedOutput);
        }
        setOutput('exit_code', result.exitCode.toString());
        // Check if the exit code should be treated as success
        if (!successExitCodes.has(result.exitCode)) {
            const errorOutput = separateOutputs
                ? result.stderr || result.stdout
                : result.combinedOutput;
            setFailed(`Command exited with code ${result.exitCode}: ${errorOutput}`);
        }
    }
    catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error)
            setFailed(error.message);
    }
}
/**
 * Parse the success exit codes input.
 * Supports individual codes (e.g., "0,1,2") and ranges (e.g., "0-2,5,10-15").
 *
 * @param input The success exit codes input string.
 * @returns A Set of exit codes that should be treated as success.
 */
function parseSuccessExitCodes(input) {
    const exitCodes = new Set();
    if (!input || input.trim() === '') {
        exitCodes.add(0);
        return exitCodes;
    }
    const parts = input.split(',').map((part) => part.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            // Parse range (e.g., "0-2")
            const [startStr, endStr] = part.split('-').map((s) => s.trim());
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (isNaN(start) || isNaN(end)) {
                throw new Error(`Invalid range format: "${part}". Expected format: "start-end" (e.g., "0-2")`);
            }
            if (start < 0 || end < 0) {
                throw new Error(`Invalid range: "${part}". Exit codes must be non-negative integers`);
            }
            if (start > end) {
                throw new Error(`Invalid range: "${part}". Start (${start}) must be less than or equal to end (${end})`);
            }
            for (let i = start; i <= end; i++) {
                exitCodes.add(i);
            }
        }
        else {
            // Parse individual code
            const code = parseInt(part, 10);
            if (isNaN(code)) {
                throw new Error(`Invalid exit code: "${part}". Expected a number or range (e.g., "0" or "0-2")`);
            }
            if (code < 0) {
                throw new Error(`Invalid exit code: "${part}". Exit codes must be non-negative integers`);
            }
            exitCodes.add(code);
        }
    }
    return exitCodes;
}
/**
 * Execute a command and capture its output.
 *
 * @param command The command to execute.
 * @param separateOutputs Whether to capture stdout and stderr separately.
 * @returns A promise that resolves with stdout, stderr, combinedOutput, and exit code.
 */
async function executeCommand(command, separateOutputs = false) {
    return new Promise((resolve, reject) => {
        // Parse command into executable and arguments
        const args = parseCommand(command);
        if (args.length === 0) {
            reject(new Error('Command cannot be empty'));
            return;
        }
        const executable = args[0];
        const commandArgs = args.slice(1);
        let stdout = '';
        let stderr = '';
        let combinedOutput = '';
        let settled = false;
        if (separateOutputs) {
            // Separate mode: use two different pipes for stdout and stderr
            const child = spawn(executable, commandArgs, {
                stdio: ['inherit', 'pipe', 'pipe']
            });
            // Capture and stream stdout
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    const text = data.toString();
                    stdout += text;
                    process.stdout.write(text);
                });
            }
            // Capture and stream stderr
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderr += text;
                    process.stderr.write(text);
                });
            }
            // Forward signals and handle process lifecycle
            setupSignalHandlers(child, () => {
                if (!settled) {
                    settled = true;
                    resolve({
                        stdout,
                        stderr,
                        combinedOutput,
                        exitCode: 0
                    });
                }
            });
            child.on('error', (error) => {
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            });
            child.on('close', (code) => {
                if (!settled) {
                    settled = true;
                    resolve({
                        stdout,
                        stderr,
                        combinedOutput,
                        exitCode: code ?? 0
                    });
                }
            });
        }
        else {
            // Combined mode: create a FIFO (named pipe) and pass it to both stdout and stderr
            // Note: Node.js doesn't expose pipe() syscall for anonymous pipes,
            // so we use mkfifo to create a named pipe which provides the same behavior
            const fifoPath = join(tmpdir(), `exec-action-${Date.now()}-${Math.random().toString(36).slice(2)}.fifo`);
            let fifoUnlinked = false;
            try {
                // Create a FIFO (named pipe)
                execSync(`mkfifo "${fifoPath}"`);
                // Track if reader has ended
                let readerEnded = false;
                // Open the FIFO for reading (non-blocking)
                const reader = createReadStream(fifoPath, { flags: 'r' });
                reader.on('data', (data) => {
                    const text = data.toString();
                    combinedOutput += text;
                    process.stdout.write(text);
                });
                reader.on('end', () => {
                    readerEnded = true;
                });
                reader.on('error', (error) => {
                    if (!settled) {
                        settled = true;
                        reader.destroy();
                        // FIFO will be either already unlinked or cleaned up by outer catch
                        reject(error);
                    }
                });
                // Open the FIFO for writing after a small delay to ensure reader is ready
                // This prevents the open call from blocking
                setTimeout(() => {
                    let writeFd = null;
                    try {
                        writeFd = openSync(fifoPath, 'w');
                        // Unlink the FIFO immediately after both ends are open
                        // The file descriptors will continue to work until closed
                        // This is the ONLY place where the FIFO is unlinked - errors are not caught
                        unlinkSync(fifoPath);
                        fifoUnlinked = true;
                        // Spawn with the same fd for both stdout and stderr
                        const child = spawn(executable, commandArgs, {
                            stdio: ['inherit', writeFd, writeFd]
                        });
                        // Set up signal handlers
                        setupSignalHandlers(child, () => {
                            if (!settled) {
                                settled = true;
                                if (writeFd !== null) {
                                    try {
                                        closeSync(writeFd);
                                    }
                                    catch {
                                        // Ignore close errors
                                    }
                                }
                                reader.destroy();
                            }
                        });
                        child.on('error', (error) => {
                            if (!settled) {
                                settled = true;
                                if (writeFd !== null) {
                                    try {
                                        closeSync(writeFd);
                                    }
                                    catch {
                                        // Ignore close errors
                                    }
                                }
                                reader.destroy();
                                reject(error);
                            }
                        });
                        child.on('close', (code) => {
                            if (!settled) {
                                settled = true;
                                // Close the write fd first
                                if (writeFd !== null) {
                                    try {
                                        closeSync(writeFd);
                                        writeFd = null;
                                    }
                                    catch {
                                        // Ignore close errors
                                    }
                                }
                                // Function to finalize and resolve
                                const finalize = () => {
                                    reader.destroy();
                                    resolve({
                                        stdout,
                                        stderr,
                                        combinedOutput,
                                        exitCode: code ?? 0
                                    });
                                };
                                // If reader has already ended, finalize immediately
                                // Otherwise wait a bit for final data
                                if (readerEnded) {
                                    finalize();
                                }
                                else {
                                    setTimeout(finalize, 50);
                                }
                            }
                        });
                    }
                    catch (error) {
                        if (!settled) {
                            settled = true;
                            if (writeFd !== null) {
                                try {
                                    closeSync(writeFd);
                                }
                                catch {
                                    // Ignore close errors
                                }
                            }
                            reader.destroy();
                            // FIFO already unlinked
                            reject(error instanceof Error ? error : new Error(String(error)));
                        }
                    }
                }, 50);
            }
            catch (error) {
                if (!settled) {
                    settled = true;
                    // Clean up FIFO only if it wasn't successfully unlinked
                    if (!fifoUnlinked) {
                        unlinkSync(fifoPath);
                    }
                    reject(error instanceof Error
                        ? error
                        : new Error(`Failed to create FIFO: ${error}`));
                }
            }
        }
    });
}
/**
 * Set up signal forwarding for a child process.
 *
 * @param child The child process to forward signals to.
 * @param cleanup Cleanup function to call when removing handlers.
 */
function setupSignalHandlers(child, cleanup) {
    const signals = [
        'SIGINT',
        'SIGTERM',
        'SIGQUIT',
        'SIGHUP',
        'SIGPIPE',
        'SIGABRT'
    ];
    const signalHandlers = new Map();
    for (const signal of signals) {
        const handler = () => {
            debug(`Received ${signal}, forwarding to child process`);
            child.kill(signal);
        };
        signalHandlers.set(signal, handler);
        process.on(signal, handler);
    }
    // Clean up signal handlers when child closes
    const cleanupSignalHandlers = () => {
        for (const [signal, handler] of signalHandlers) {
            process.removeListener(signal, handler);
        }
        signalHandlers.clear();
        cleanup();
    };
    child.on('close', cleanupSignalHandlers);
    child.on('error', cleanupSignalHandlers);
}
/**
 * Parse a command string into an array of arguments.
 * Handles quoted strings and escapes.
 *
 * @param command The command string to parse.
 * @returns An array of arguments.
 */
function parseCommand(command) {
    const args = [];
    let current = '';
    let inQuotes = null;
    let escaped = false;
    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (inQuotes) {
            if (char === inQuotes) {
                inQuotes = null;
            }
            else {
                current += char;
            }
        }
        else if (char === '"' || char === "'") {
            inQuotes = char;
        }
        else if (char === ' ' || char === '\t' || char === '\n') {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
        }
        else {
            current += char;
        }
    }
    // Handle edge cases
    if (escaped) {
        throw new Error('Invalid command: ends with an incomplete escape sequence');
    }
    if (inQuotes) {
        throw new Error(`Invalid command: unclosed quote (${inQuotes})`);
    }
    if (current.length > 0) {
        args.push(current);
    }
    return args;
}

/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
/* istanbul ignore next */
run();
//# sourceMappingURL=index.js.map
