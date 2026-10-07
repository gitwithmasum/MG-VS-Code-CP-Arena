# Masum Galaxy // CP Arena

A focused, futuristic Competitive Programming arena for VS Code.

This standalone extension is extracted from the **Galaxy CP Arena — v2.9** feature inside **Masum Galaxy // Developer OS**. The Developer OS implementation remains unchanged; this repository contains only the CP-focused experience and the small support layer it needs.

## Features

- Contest timer with A–H problem tracking
- Per-problem status, attempts, and active solving time
- Local sample judge
- Multi-case judge using `---` separators
- Stress testing with Generator + Brute + Optimized solutions
- C/C++, Python, and JavaScript runners
- C++17 / Python / JavaScript problem templates
- Competitive-programming snippet vault
- Verdict and stress-test history
- CP Focus mode using VS Code Zen Mode
- AI Complexity analysis
- AI Edge Case generation
- Panic Assist with three escalating hints instead of a copy-paste final solution
- Quick access to Codeforces, AtCoder, LeetCode, and CodeChef

## Supported runners

| Language | Requirement |
| --- | --- |
| C | `gcc` on PATH |
| C++ | `g++` on PATH |
| Python | `python`, `python3`, or `py` |
| JavaScript | Node.js |

The local judge uses a 5-second execution limit for normal sample/test runs. C/C++ builds use optimization and C17/C++17 standards.

## Open the Arena

After installing the extension, click **Galaxy CP Arena** in the VS Code Activity Bar, or run:

`Masum Galaxy CP Arena: Open Arena`

Useful Command Palette actions are also provided for starting contests, creating problem files, stress testing, opening the snippet vault, and toggling CP Focus mode.

## Multi-case format

Separate input cases with a line containing only:

```text
---
```

Do the same for expected outputs. Input and expected-output case counts must match.

## Stress testing

1. Open the optimized solution.
2. Choose **Stress Test**.
3. Select a generator source file.
4. Select a brute-force solution.
5. Choose 1–100 iterations.

The Arena stops on the first mismatch or failed stage and preserves the failing input/results.

## AI Coach

AI actions use the VS Code Language Model API when a compatible model is available.

- **Complexity** analyzes selected code, or the current source file.
- **Edge Cases** designs high-value tests without inventing an unseen input format.
- **Panic Assist** reads a problem statement from the clipboard and returns three escalating hints rather than a complete implementation.

## Privacy and safety

- Contest state and run history are stored in this extension's VS Code storage.
- Local judging executes code on the user's own workspace environment.
- The extension does not contain a hard-coded personal project path or repository.
- AI features send code/problem text to the selected VS Code language model only after the user explicitly invokes an AI action.
- Untrusted workspaces are not supported because the Arena can compile and execute workspace code.

## Development

```bash
npm install
npm run check
npm test
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.

## Origin

The CP engine was extracted from the existing **Masum Galaxy // Developer OS** project so the same CP Arena can also exist as a focused standalone extension. The original Developer OS CP Arena remains in place.

## License

MIT © 2026 Masum Billah
