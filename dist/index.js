import { spawn } from 'child_process';
import { appendFileSync } from 'fs';

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
    const delimiter = `ghadelimiter_${Math.random().toString(36).substring(2)}`;
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
        debug(`Executing command: ${command}`);
        debug(`Success exit codes: ${successExitCodesInput}`);
        // Parse success exit codes
        const successExitCodes = parseSuccessExitCodes(successExitCodesInput);
        // Execute the command and capture outputs
        const result = await executeCommand(command);
        // Set outputs for other workflow steps to use
        setOutput('stdout', result.stdout);
        setOutput('stderr', result.stderr);
        setOutput('exit_code', result.exitCode.toString());
        // Check if the exit code should be treated as success
        if (!successExitCodes.has(result.exitCode)) {
            setFailed(`Command exited with code ${result.exitCode}: ${result.stderr || result.stdout}`);
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
 * @returns A promise that resolves with stdout, stderr, and exit code.
 */
async function executeCommand(command) {
    return new Promise((resolve, reject) => {
        // Parse command into executable and arguments
        // Simple parsing that splits on whitespace while respecting quoted strings
        const args = parseCommand(command);
        if (args.length === 0) {
            reject(new Error('Command cannot be empty'));
            return;
        }
        const executable = args[0];
        const commandArgs = args.slice(1);
        // Execute command directly without shell
        const child = spawn(executable, commandArgs, {
            stdio: ['inherit', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
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
        // Forward signals to the child process
        const signals = [
            'SIGINT',
            'SIGTERM',
            'SIGQUIT',
            'SIGHUP',
            'SIGPIPE',
            'SIGABRT'
        ];
        // Create individual signal handlers for proper cleanup
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
        };
        // Handle errors (e.g., command not found)
        child.on('error', (error) => {
            if (!settled) {
                settled = true;
                cleanupSignalHandlers();
                reject(error);
            }
        });
        // Handle process exit
        child.on('close', (code) => {
            if (!settled) {
                settled = true;
                cleanupSignalHandlers();
                resolve({
                    stdout,
                    stderr,
                    exitCode: code ?? 0
                });
            }
        });
    });
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
