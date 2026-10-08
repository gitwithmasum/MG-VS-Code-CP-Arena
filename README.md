# Masum Galaxy // CP Arena

![Masum Galaxy CP Arena banner](media/cp-arena-banner.png)

<!-- Replace media/cp-arena-banner.png with your final banner later. Keep the same filename and the README needs no further edit. -->

A focused, futuristic Competitive Programming cockpit for VS Code: local judging, contest tracking, stress testing, verdict diagnostics, benchmarks, snippets, safe AI coaching, and keyboard-first workflows.

> Standalone edition of the CP Arena experience. The original CP Arena inside **Masum Galaxy // Developer OS** remains unchanged.

## Highlights

- Contest timer with A–H problem tracking, per-problem state, attempts, and solving time
- Local sample judge for C/C++, Python, and JavaScript
- Dedicated multi-case judge using `---` separators
- First-mismatch Verdict Diff Viewer for Wrong Answer debugging
- Runtime and best-effort peak-memory benchmark display
- Stress testing with Generator + Brute + Optimized solutions
- Saved failing stress input with **Re-run Failed Case**
- C++17 / Python / JavaScript problem templates
- Competitive-programming Snippet Vault
- CP Focus mode using VS Code Zen Mode
- Verdict and stress-test history
- AI Complexity analysis, Edge Case generation, and Panic Assist
- Quick access to Codeforces, AtCoder, LeetCode, and CodeChef
- Keyboard-first shortcuts for common contest actions

## Supported runners

| Language | Requirement |
| --- | --- |
| C | `gcc` |
| C++ | `g++` |
| Python | `python`, `python3`, or `py` |
| JavaScript | Node.js |

On Windows, CP Arena also checks common MSYS2/MinGW compiler locations such as `C:\msys64\ucrt64\bin`. Normal sample and multi-case executions use a 5-second limit. C/C++ builds use C17/C++17 with `-O2`.

## Open the Arena

Click **Galaxy CP Arena** in the Activity Bar, or run:

`Masum Galaxy CP Arena: Open Arena`

The Command Palette also exposes contest, problem-file, stress-test, snippet, focus, re-run, AC, and navigation commands.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Run last sample | `Ctrl+Alt+R` | `Cmd+Alt+R` |
| Run last multi-case suite | `Ctrl+Alt+M` | `Cmd+Alt+M` |
| Stress test | `Ctrl+Alt+T` | `Cmd+Alt+T` |
| Mark current problem AC | `Ctrl+Alt+A` | `Cmd+Alt+A` |
| Next problem | `Ctrl+Alt+N` | `Cmd+Alt+N` |

## Multi-case judge

Put each case in the dedicated Multi-case Input box and separate cases with a line containing only:

```text
---
```

Do the same in Multi-case Expected Output. Input and expected-output case counts must match.

Example input:

```text
1 2
---
5 7
---
10 20
```

Expected:

```text
3
---
12
---
30
```

## Verdict diagnostics

When expected and actual output differ, CP Arena reports the first mismatching token and line and shows the corresponding expected/actual values. Run results also show runtime and a best-effort peak-memory sample when the process lives long enough to be measured.

## Stress testing

1. Open the optimized solution.
2. Choose **Stress Test**.
3. Select the generator.
4. Select the brute-force solution.
5. Choose 1–100 iterations.

The Arena stops on the first mismatch or failed stage, stores the failing input/results, and exposes **Re-run Failed Case** so the optimized solution can be reproduced against that exact input.

## New Problem File and Snippet Vault

**New Problem File** creates a C++17, Python, or JavaScript starter. If no workspace root is available, CP Arena falls back to the active source folder or asks you to choose a folder.

**Snippet Vault** inserts CP-focused snippets directly at the current editor selection/cursor.

## AI Coach

AI actions use the VS Code Language Model API. CP Arena prefers models exposed by the GitHub Copilot provider and falls back to other compatible VS Code language-model providers when available.

- **O() Complexity** analyzes selected code, or the current source file.
- **Edge Cases** designs high-value tests without inventing an unseen input format.
- **Panic Assist** reads a copied problem statement and returns three escalating hints instead of a copy-paste final solution.

AI features only run after an explicit user action.

## Privacy and safety

- Contest state and run history stay in this extension's VS Code storage.
- Local judging executes source files on the user's own environment.
- No hard-coded personal project path, GitHub token, or API key is included.
- AI actions may send the selected/current code or copied problem statement to the VS Code language-model provider only after the user invokes the action.
- Untrusted workspaces are not supported because CP Arena can compile and execute workspace code.

## Development

```bash
npm install
npm run check
npm test
npm run package
```

Press `F5` to launch an Extension Development Host.

## Banner replacement

The current README banner is intentionally replaceable. Later, put your preferred PNG at:

```text
media/cp-arena-banner.png
```

Keep that filename and the README banner will update automatically.

## Support

See [SUPPORT.md](SUPPORT.md) or open an issue in this repository.

## Origin

The CP engine was extracted from **Masum Galaxy // Developer OS** so it can also exist as a focused standalone extension. The Developer OS copy remains in place.

## License

MIT © 2026 Masum Billah
