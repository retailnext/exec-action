# Execute Command Action

![Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

A GitHub Action that executes an arbitrary command and captures its output,
including stdout, stderr, and exit code. The action streams command output in
real-time and forwards signals to the command.

## ⚠️ BREAKING CHANGE

**Default behavior has changed:** By default, stdout and stderr are now combined
into a single `combined_output` output. The `stdout` and `stderr` outputs are
**no longer available by default**.

- **Previous behavior:** Separate `stdout` and `stderr` outputs
- **New default behavior:** Single `combined_output` containing both streams
- **To restore old behavior:** Set `separate_outputs: true`

This change ensures that the natural interleaving of stdout and stderr is
preserved in the output.

## Features

- Execute any single command
- **By default:** Combine stdout and stderr into a single output stream that
  preserves the natural interleaving of both streams
- **Optionally:** Capture stdout and stderr separately
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
      echo "Output: ${{ steps.exec.outputs.combined_output }}"
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

### `separate_outputs`

**Optional** When `false` (default), stdout and stderr are combined into a
single output stream (`combined_output`). When `true`, stdout and stderr are
captured separately.

**Default:** `"false"` (combined output)

**⚠️ Breaking Change:** This changes the default outputs from `stdout` and
`stderr` to `combined_output`. Set `separate_outputs: true` to restore the
previous behavior.

## Outputs

### `combined_output`

**Default output.** The combined stdout and stderr of the executed command. Only
set when `separate_outputs` is `false` (default).

This output preserves the natural interleaving of stdout and stderr as they are
produced by the command.

### `stdout`

The standard output of the executed command. Only set when `separate_outputs` is
`true`.

**Not available by default.** To get this output, you must set
`separate_outputs: true`.

### `stderr`

The standard error of the executed command. Only set when `separate_outputs` is
`true`.

**Not available by default.** To get this output, you must set
`separate_outputs: true`.

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
    echo "Error output: ${{ steps.run.outputs.combined_output }}"
```

### Capture stdout and stderr separately

```yaml
- name: Run Command with Separate Outputs
  id: run
  uses: retailnext/exec-action@main
  with:
    command: 'my-command --verbose'
    separate_outputs: true

- name: Print Outputs
  run: |
    echo "Standard Output: ${{ steps.run.outputs.stdout }}"
    echo "Standard Error: ${{ steps.run.outputs.stderr }}"
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
