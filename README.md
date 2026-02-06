# Execute Command Action

![Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

A GitHub Action that executes an arbitrary command and captures its output to
files, including stdout, stderr, and exit code. The action streams command
output in real-time and forwards signals to the command.

## Breaking Changes

**BREAKING CHANGE**: This action now writes stdout and stderr to files instead
of GitHub Action outputs. This change addresses issues with passing large
outputs to subsequent steps (which could cause "Argument list too long" errors).
The outputs `stdout` and `stderr` have been replaced with `stdout_file` and
`stderr_file`, which contain paths to the files where the output is stored.

## Features

- Execute any single command
- Capture standard output and standard error to temporary files
- Output file paths available as action outputs
- Stream output in real-time to the workflow logs
- Forward signals (SIGINT, SIGTERM, SIGQUIT, SIGHUP, SIGPIPE, SIGABRT) to the
  running command
- Commands are executed directly without a shell (no shell operators like `|`,
  `&&`, `>`)

**IMPORTANT:** This action executes commands **directly without a shell**. This
means shell features like pipes (`|`), redirects (`>`), command chaining (`&&`,
`||`), and glob expansion (`*`) are **not available**.

## Usage

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v6

  - name: Execute Command
    id: exec
    uses: retailnext/exec-action@main
    with:
      command: 'echo "Hello World"'

  - name: Print Output
    run: |
      echo "Exit Code: ${{ steps.exec.outputs.exit_code }}"
      echo "Stdout File: ${{ steps.exec.outputs.stdout_file }}"
      echo "Stderr File: ${{ steps.exec.outputs.stderr_file }}"
      echo "Stdout Content:"
      cat "${{ steps.exec.outputs.stdout_file }}"
      echo "Stderr Content:"
      cat "${{ steps.exec.outputs.stderr_file }}"
```

## Inputs

### `command`

**Required** The command to execute with its arguments.

The command is executed directly without a shell. Executables in your PATH can
be used without specifying the full path (e.g., `npm`, `ls`, `git`).

### `success_exit_codes`

**Optional** Exit codes that should be treated as success. Can be individual
codes (e.g., `"0,1,2"`) or ranges (e.g., `"0-2,5,10-15"`). Default is `"0"`.

This is useful when your command may exit with non-zero codes that should still
be considered successful. For example, some linters return specific exit codes
for warnings vs errors, or you may want to accept multiple exit codes as valid
outcomes.

## Outputs

### `stdout_file`

Path to the file containing the standard output of the executed command. The
file is located in the directory specified by the `RUNNER_TEMP` environment
variable.

### `stderr_file`

Path to the file containing the standard error of the executed command. The file
is located in the directory specified by the `RUNNER_TEMP` environment variable.

### `exit_code`

The exit code of the executed command (as a string).

## Examples

### Run a build command

```yaml
- name: Build Project
  id: build
  uses: retailnext/exec-action@main
  with:
    command: 'npm run build'

- name: Check Build Status
  if: steps.build.outputs.exit_code == '0'
  run: echo "Build succeeded!"
```

### Handle errors

```yaml
- name: Run Command
  id: run
  uses: retailnext/exec-action@main
  with:
    command: 'some-command-that-might-fail'
  continue-on-error: true

- name: Handle Failure
  if: steps.run.outputs.exit_code != '0'
  run: |
    echo "Command failed with exit code ${{ steps.run.outputs.exit_code }}"
    echo "Error output:"
    cat "${{ steps.run.outputs.stderr_file }}"
```

### Accept multiple exit codes as success

```yaml
- name: Run Linter
  uses: retailnext/exec-action@main
  with:
    command: 'eslint .'
    # Treat exit codes 0 (no issues) and 1 (warnings only) as success
    success_exit_codes: '0,1'
```

### Accept a range of exit codes

```yaml
- name: Run Tests
  uses: retailnext/exec-action@main
  with:
    command: 'pytest'
    # Treat exit codes 0-5 as success
    success_exit_codes: '0-5'
```

### Mix individual codes and ranges

```yaml
- name: Complex Command
  uses: retailnext/exec-action@main
  with:
    command: 'some-tool --check'
    # Accept 0, any code from 10-15, and 20 as success
    success_exit_codes: '0,10-15,20'
```
