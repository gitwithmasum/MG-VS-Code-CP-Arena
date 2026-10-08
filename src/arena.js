const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getWorkspaceRoot } = require('./core/workspace');
const {
  getCpArenaState,
  startNewContest,
  stopContest,
  switchProblem,
  setProblemStatus,
  resetCpSession,
  runCurrentFile,
  runMultipleCases,
  runStressTest,
  saveLastRun,
  saveLastSuite,
  saveStressResult,
  getCpTemplate,
  getCpSnippets
} = require('./features/cp');

const SOURCE_LANGUAGES = new Set(['c', 'cpp', 'python', 'javascript']);

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncatePromptText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n[truncated]';
}

function nonce() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function requestGalaxyModel(prompt, systemInstruction) {
  const models =
    vscode.lm && typeof vscode.lm.selectChatModels === 'function'
      ? await vscode.lm.selectChatModels()
      : [];

  if (!models.length) {
    return {
      ok: false,
      text: '',
      model: 'No model',
      error: 'No VS Code language model is currently available.'
    };
  }

  const model = models[0];
  const messages = [];
  if (systemInstruction) {
    messages.push(vscode.LanguageModelChatMessage.User(systemInstruction));
  }
  messages.push(vscode.LanguageModelChatMessage.User(prompt));

  const cts = new vscode.CancellationTokenSource();
  let responseText = '';

  try {
    const response = await model.sendRequest(messages, {}, cts.token);
    for await (const fragment of response.text) {
      responseText += fragment;
      if (responseText.length >= 16000) break;
    }

    return {
      ok: true,
      text: responseText.trim(),
      model: model.name || model.family || model.id || 'VS Code Language Model',
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      text: '',
      model: '',
      error: error && error.message ? error.message : 'Language model request failed.'
    };
  } finally {
    cts.dispose();
  }
}

function renderProblems(problems) {
  return (problems || []).map((item) => {
    const statusClass =
      item.status === 'AC'
        ? 'cp-ac'
        : ['WA', 'TLE', 'RE', 'CE'].includes(item.status)
          ? 'cp-fail'
          : item.status === 'SOLVING'
            ? 'cp-solving'
            : '';

    return '<button class="problem ' + statusClass + (item.current ? ' active' : '') +
      '" data-problem="' + escapeHtml(item.label) + '">' +
      '<span class="letter">' + escapeHtml(item.label) + '</span>' +
      '<strong>' + escapeHtml(item.status) + '</strong>' +
      '<small>' + escapeHtml(item.activeText) +
      (item.attempts ? ' · ' + item.attempts + ' fail' + (item.attempts === 1 ? '' : 's') : '') +
      '</small></button>';
  }).join('');
}

function renderHistory(history) {
  if (!history || !history.length) {
    return '<p class="muted">No verdict history yet.</p>';
  }

  return history.slice(0, 10).map((item) => {
    const when = item.at ? new Date(item.at).toLocaleTimeString() : '';
    const detail =
      item.type === 'suite'
        ? Number(item.passed || 0) + '/' + Number(item.total || 0) + ' cases'
        : item.type === 'stress'
          ? 'iteration ' + Number(item.iteration || 0)
          : Number(item.runtimeMs || 0) + ' ms';

    return '<div class="history-row"><div><strong>Problem ' +
      escapeHtml(item.problem || '?') + ' · ' +
      escapeHtml(item.verdict || item.type || 'RUN') +
      '</strong><small>' + escapeHtml(item.type || 'sample') + ' · ' +
      escapeHtml(when) + '</small></div><span>' +
      escapeHtml(detail) + '</span></div>';
  }).join('');
}

function renderSuite(suite) {
  if (!suite || !suite.cases || !suite.cases.length) return '';
  return suite.cases.map((item) =>
    '<div class="history-row"><div><strong>Case ' + item.index + ' · ' +
    escapeHtml(item.verdict) + '</strong><small>' +
    Number(item.runtimeMs || 0) + ' ms</small></div><span>' +
    (item.verdict === 'PASS' ? '✓' : '×') + '</span></div>'
  ).join('');
}

class CpArenaProvider {
  static viewType = 'masumGalaxyCpArena.sidebar';

  constructor(context) {
    this.context = context;
    this.view = null;
    this.lastSourceUri = '';
    this.timer = null;
    this.aiState = {
      running: false,
      kind: '',
      result: '',
      model: '',
      error: ''
    };
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        try {
          await this.execute(message && message.command, message && message.value);
        } catch (error) {
          vscode.window.showErrorMessage(
            error && error.message ? error.message : 'Galaxy CP action failed.'
          );
        }
      },
      null,
      this.context.subscriptions
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refresh();
    });

    this.refresh();
  }

  rememberEditor(editor) {
    if (!editor || !editor.document || editor.document.uri.scheme !== 'file') return;
    if (!SOURCE_LANGUAGES.has(editor.document.languageId)) return;
    this.lastSourceUri = editor.document.uri.toString();
  }

  async getSourceDocument() {
    const active = vscode.window.activeTextEditor;
    if (
      active &&
      active.document &&
      active.document.uri.scheme === 'file' &&
      SOURCE_LANGUAGES.has(active.document.languageId)
    ) {
      this.lastSourceUri = active.document.uri.toString();
      return active.document;
    }

    if (this.lastSourceUri) {
      try {
        const uri = vscode.Uri.parse(this.lastSourceUri);
        if (uri.scheme === 'file') {
          return await vscode.workspace.openTextDocument(uri);
        }
      } catch {}
    }

    return null;
  }

  async getEditableEditor() {
    const active = vscode.window.activeTextEditor;
    if (
      active &&
      active.document &&
      active.document.uri.scheme === 'file' &&
      SOURCE_LANGUAGES.has(active.document.languageId)
    ) {
      return active;
    }

    const document = await this.getSourceDocument();
    if (!document) return null;
    return vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
  }

  startClock() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      const state = getCpArenaState(this.context);
      if (state.contest.running && state.contest.remainingMs <= 0) {
        await stopContest(this.context);
        vscode.window.showWarningMessage('Galaxy CP contest time is up.');
        this.refresh();
      }
    }, 1000);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async execute(command, value) {
    let shouldRefresh = true;

    switch (command) {
      case 'refresh':
        break;
      case 'cpStartContest':
        await this.startContest();
        break;
      case 'cpStopContest':
        await stopContest(this.context);
        vscode.window.showInformationMessage('Galaxy CP contest timer stopped.');
        break;
      case 'cpResetArena':
        await this.resetArena();
        break;
      case 'cpSwitchProblem':
        await switchProblem(this.context, value);
        break;
      case 'cpSetStatus':
        await setProblemStatus(this.context, value);
        break;
      case 'cpRunSample':
        await this.runSample(value);
        break;
      case 'cpRunMulti':
        await this.runMulti(value);
        break;
      case 'cpStressTest':
        await this.runStress();
        break;
      case 'cpNewProblemFile':
        await this.createProblemFile();
        break;
      case 'cpSnippetVault':
        await this.openSnippetVault();
        break;
      case 'cpAiComplexity':
        await this.runAi('complexity');
        break;
      case 'cpAiEdgeCases':
        await this.runAi('edge-cases');
        break;
      case 'cpPanicAssist':
        await this.runPanicAssist();
        break;
      case 'cpFocusMode':
        await this.toggleFocusMode();
        break;
      case 'cpPlatform':
        await this.openPlatform(value);
        shouldRefresh = false;
        break;
      default:
        shouldRefresh = false;
        break;
    }

    if (shouldRefresh) this.refresh();
  }

  async startContest() {
    const value = await vscode.window.showInputBox({
      title: 'Galaxy CP Arena · New Contest',
      prompt: 'Contest duration in minutes',
      value: '120',
      validateInput: (input) => {
        const minutes = Number(input);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) {
          return 'Enter a number between 1 and 720 minutes.';
        }
        return undefined;
      }
    });

    if (value === undefined) return false;

    const current = getCpArenaState(this.context);
    const hasActivity =
      current.contest.running ||
      current.problems.some((item) => item.status !== 'NOT STARTED');

    if (hasActivity) {
      const confirm = await vscode.window.showWarningMessage(
        'Starting a new CP contest resets the current problem tracker.',
        { modal: true },
        'Start New Contest'
      );
      if (confirm !== 'Start New Contest') return false;
    }

    await startNewContest(this.context, Number(value));
    vscode.window.showInformationMessage(
      'Galaxy CP contest started for ' + Number(value) + ' minutes.'
    );
    return true;
  }

  async resetArena() {
    const confirm = await vscode.window.showWarningMessage(
      'Reset the current Galaxy CP Arena session?',
      { modal: true },
      'Reset'
    );
    if (confirm !== 'Reset') return false;

    await resetCpSession(this.context);
    this.aiState = {
      running: false,
      kind: '',
      result: '',
      model: '',
      error: ''
    };
    return true;
  }

  async runSample(value) {
    const document = await this.getSourceDocument();
    if (!document) {
      vscode.window.showInformationMessage(
        'Open a C/C++, Python, or JavaScript source file first.'
      );
      return false;
    }

    if (document.isDirty && !(await document.save())) {
      vscode.window.showWarningMessage('Save the source file before running a CP sample.');
      return false;
    }

    const input = String(value && value.input || '').slice(0, 20000);
    const expected = String(value && value.expected || '').slice(0, 20000);

    vscode.window.setStatusBarMessage('Galaxy CP · Running sample…', 2200);
    const run = await runCurrentFile(document, input, expected);
    run.input = input;
    await saveLastRun(this.context, run);

    if (run.verdict === 'PASS') {
      vscode.window.showInformationMessage(
        'Galaxy CP: sample passed in ' + run.runtimeMs + ' ms.'
      );
    } else {
      vscode.window.showWarningMessage(
        'Galaxy CP: ' + run.verdict + ' · ' + run.runtimeMs + ' ms.'
      );
    }
    return true;
  }

  async runMulti(value) {
    const document = await this.getSourceDocument();
    if (!document) {
      vscode.window.showInformationMessage(
        'Open a C/C++, Python, or JavaScript source file first.'
      );
      return false;
    }

    if (document.isDirty && !(await document.save())) {
      vscode.window.showWarningMessage('Save the source file before running CP cases.');
      return false;
    }

    const rawInputs = String(value && value.input || '').slice(0, 50000);
    const rawExpected = String(value && value.expected || '').slice(0, 50000);
    const suite = await runMultipleCases(document, rawInputs, rawExpected);

    // Persist the exact suite text so UI rerenders never fall back to the
    // single-sample fields and accidentally collapse a multi-case run.
    suite.rawInput = rawInputs;
    suite.rawExpected = rawExpected;

    if (!suite.ok) {
      vscode.window.showWarningMessage(
        'Galaxy CP Multi Judge: ' + (suite.error || 'Unable to run cases.')
      );
      return false;
    }

    await saveLastSuite(this.context, suite);

    if (suite.verdict === 'PASS') {
      vscode.window.showInformationMessage(
        'Galaxy CP: all ' + suite.total + ' cases passed.'
      );
    } else {
      vscode.window.showWarningMessage(
        'Galaxy CP: ' + suite.verdict + ' after ' +
        suite.passed + '/' + suite.total + ' passed · detected ' +
        suite.total + ' case' + (suite.total === 1 ? '' : 's') + '.'
      );
    }

    return true;
  }

  async createProblemFile() {
    const root = getWorkspaceRoot();
    if (!root) {
      vscode.window.showInformationMessage('Open a workspace folder first.');
      return false;
    }

    const language = await vscode.window.showQuickPick(
      [
        { label: 'C++17', value: 'cpp' },
        { label: 'Python 3', value: 'python' },
        { label: 'JavaScript (Node)', value: 'javascript' }
      ],
      {
        title: 'Galaxy CP · New Problem File',
        placeHolder: 'Choose a language'
      }
    );
    if (!language) return false;

    const state = getCpArenaState(this.context);
    const label = await vscode.window.showInputBox({
      title: 'Problem Label',
      prompt: 'Problem label or short name',
      value: state.currentProblem || 'A',
      validateInput: (input) =>
        /^[A-Za-z0-9_-]{1,24}$/.test(String(input || ''))
          ? undefined
          : 'Use 1–24 letters, numbers, underscores, or hyphens.'
    });
    if (!label) return false;

    const template = getCpTemplate(language.value, label);
    const target = await vscode.window.showSaveDialog({
      title: 'Create CP Problem File',
      defaultUri: vscode.Uri.file(
        path.join(root, label.toLowerCase() + '.' + template.extension)
      ),
      saveLabel: 'Create Problem File',
      filters: {
        'Source File': [template.extension]
      }
    });
    if (!target) return false;

    if (fs.existsSync(target.fsPath)) {
      vscode.window.showWarningMessage('That file already exists. Choose a new filename.');
      return false;
    }

    await vscode.workspace.fs.writeFile(
      target,
      Buffer.from(template.content, 'utf8')
    );

    const document = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(document, { preview: false });
    this.lastSourceUri = target.toString();
    vscode.window.showInformationMessage('Galaxy CP problem file created.');
    return true;
  }

  async pickSourceFile(title, exclude) {
    const files = await vscode.workspace.findFiles(
      '**/*.{cpp,c,py,js}',
      '**/{node_modules,.git,dist,build,out,.next,coverage}/**',
      200
    );

    const excluded = new Set(
      (exclude || []).map((value) => String(value || '').toLowerCase())
    );

    const items = files
      .filter((uri) => !excluded.has(uri.fsPath.toLowerCase()))
      .map((uri) => ({
        label: vscode.workspace.asRelativePath(uri, false),
        description: uri.fsPath,
        uri
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const selected = await vscode.window.showQuickPick(items, {
      title,
      placeHolder: 'Choose a source file'
    });

    return selected && selected.uri || null;
  }

  async runStress() {
    const optimized = await this.getSourceDocument();
    if (!optimized) {
      vscode.window.showInformationMessage(
        'Open your optimized solution first.'
      );
      return false;
    }

    if (optimized.isDirty && !(await optimized.save())) {
      vscode.window.showWarningMessage(
        'Save the optimized solution before stress testing.'
      );
      return false;
    }

    const generatorUri = await this.pickSourceFile(
      'Galaxy CP Stress · Select Generator',
      [optimized.uri.fsPath]
    );
    if (!generatorUri) return false;

    const bruteUri = await this.pickSourceFile(
      'Galaxy CP Stress · Select Brute Solution',
      [optimized.uri.fsPath, generatorUri.fsPath]
    );
    if (!bruteUri) return false;

    const iterationsRaw = await vscode.window.showInputBox({
      title: 'Galaxy CP Stress Test',
      prompt: 'Number of random tests',
      value: '20',
      validateInput: (input) => {
        const count = Number(input);
        if (!Number.isInteger(count) || count < 1 || count > 100) {
          return 'Enter an integer between 1 and 100.';
        }
        return undefined;
      }
    });
    if (iterationsRaw === undefined) return false;

    const generator = await vscode.workspace.openTextDocument(generatorUri);
    const brute = await vscode.workspace.openTextDocument(bruteUri);
    if (generator.isDirty) await generator.save();
    if (brute.isDirty) await brute.save();

    vscode.window.setStatusBarMessage('Galaxy CP · Stress test running…', 3000);

    const result = await runStressTest(
      generator,
      brute,
      optimized,
      Number(iterationsRaw)
    );

    await saveStressResult(this.context, result);

    if (!result.ok) {
      vscode.window.showWarningMessage(
        'Galaxy CP Stress failed at ' +
        (result.stage || 'unknown stage') +
        (result.iteration ? ' · iteration ' + result.iteration : '') + '.'
      );
      return false;
    }

    if (result.verdict === 'MISMATCH') {
      vscode.window.showWarningMessage(
        'Galaxy CP found a mismatch at iteration ' + result.iteration + '.'
      );
    } else {
      vscode.window.showInformationMessage(
        'Galaxy CP stress test passed ' + result.iterations + ' iteration(s).'
      );
    }

    return true;
  }

  async openSnippetVault() {
    const editor = await this.getEditableEditor();
    if (!editor) {
      vscode.window.showInformationMessage('Open a source file first.');
      return false;
    }

    const snippets = getCpSnippets(editor.document.languageId);
    const selected = await vscode.window.showQuickPick(
      snippets.map((item) => ({
        label: item.label,
        description: item.detail,
        snippet: item.code
      })),
      {
        title: 'Galaxy CP Snippet Vault',
        placeHolder: 'Choose a competitive-programming snippet'
      }
    );

    if (!selected) return false;

    await editor.edit((builder) => {
      builder.replace(editor.selection, selected.snippet);
    });
    return true;
  }

  async runAi(kind) {
    const document = await this.getSourceDocument();
    if (!document) {
      vscode.window.showInformationMessage('Open a source file first.');
      return false;
    }

    const editor = vscode.window.activeTextEditor;
    const selected =
      editor &&
      editor.document.uri.toString() === document.uri.toString() &&
      !editor.selection.isEmpty
        ? document.getText(editor.selection)
        : '';

    const source = selected || document.getText();

    this.aiState = {
      running: true,
      kind,
      result: '',
      model: '',
      error: ''
    };
    this.refresh();

    let prompt = '';
    let instruction = '';

    if (kind === 'complexity') {
      prompt = [
        'Analyze the time and space complexity of this competitive-programming code.',
        'Return: Time Complexity, Space Complexity, Why, Bottleneck, and whether it is likely safe for common constraints such as 1e5 or 1e6.',
        'State uncertainty when input constraints are missing.',
        '',
        'Language: ' + document.languageId,
        selected ? 'Context: selected code' : 'Context: current file',
        '',
        truncatePromptText(source, 14000)
      ].join('\n');

      instruction =
        'Act as a competitive-programming coach. Be mathematically precise and do not invent constraints.';
    } else {
      prompt = [
        'Generate high-value edge cases for this competitive-programming solution.',
        'Focus on boundaries, duplicates, sorted/reversed data, zero/one-element cases, overflow, disconnected cases, and algorithm-specific traps when relevant.',
        'Return a concise numbered list with why each case matters. Include concrete sample inputs only when the input format is inferable from the code.',
        '',
        'Language: ' + document.languageId,
        '',
        truncatePromptText(source, 14000)
      ].join('\n');

      instruction =
        'Act as a competitive-programming test designer. Do not pretend to know an input format that is not visible.';
    }

    const ai = await requestGalaxyModel(prompt, instruction);

    this.aiState = {
      running: false,
      kind,
      result: ai.text,
      model: ai.model,
      error: ai.error
    };

    return ai.ok;
  }

  async runPanicAssist() {
    const statement = (await vscode.env.clipboard.readText()).trim();
    if (!statement) {
      vscode.window.showInformationMessage(
        'Copy the problem statement first, then use CP Panic Assist.'
      );
      return false;
    }

    this.aiState = {
      running: true,
      kind: 'panic',
      result: '',
      model: '',
      error: ''
    };
    this.refresh();

    const ai = await requestGalaxyModel(
      [
        'A competitive-programming contestant is stuck on this problem.',
        'Do NOT give a full final solution or complete implementation.',
        'Give exactly three escalating hints:',
        'Hint 1: direction / observation only.',
        'Hint 2: likely algorithm or data structure.',
        'Hint 3: pseudocode-level strategy and important edge cases.',
        'Also mention the likely target complexity if it can be inferred.',
        '',
        truncatePromptText(statement, 12000)
      ].join('\n'),
      'Act as a competitive-programming coach. Preserve the learning value and avoid giving a copy-paste final answer.'
    );

    this.aiState = {
      running: false,
      kind: 'panic',
      result: ai.text,
      model: ai.model,
      error: ai.error
    };

    return ai.ok;
  }

  async toggleFocusMode() {
    const commands = await vscode.commands.getCommands(true);
    if (!commands.includes('workbench.action.toggleZenMode')) {
      vscode.window.showInformationMessage('VS Code Zen Mode is unavailable.');
      return false;
    }
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    return true;
  }

  async openPlatform(platform) {
    const urls = {
      codeforces: 'https://codeforces.com/',
      atcoder: 'https://atcoder.jp/',
      leetcode: 'https://leetcode.com/',
      codechef: 'https://www.codechef.com/'
    };

    const url = urls[String(platform || '').toLowerCase()];
    if (!url) return false;

    await vscode.env.openExternal(vscode.Uri.parse(url));
    return true;
  }

  refresh() {
    if (!this.view) return;
    this.view.webview.html = this.render(this.view.webview);
  }

  render(webview) {
    const state = getCpArenaState(this.context);
    const ai = this.aiState;
    const n = nonce();

    const lastRun = state.lastRun
      ? '<div class="result"><div class="result-head"><strong>' +
        escapeHtml(state.lastRun.verdict) + '</strong> · ' +
        Number(state.lastRun.runtimeMs || 0) + ' ms · Problem ' +
        escapeHtml(state.lastRun.problem || state.currentProblem) +
        '</div><div class="section-title">ACTUAL OUTPUT</div><pre>' +
        escapeHtml(state.lastRun.stdout || '[no stdout]') + '</pre>' +
        (state.lastRun.stderr
          ? '<div class="section-title">STDERR</div><pre>' +
            escapeHtml(state.lastRun.stderr) + '</pre>'
          : '') +
        '</div>'
      : '';

    const lastSuite = state.lastSuite && state.lastSuite.cases && state.lastSuite.cases.length
      ? '<div class="section-title top">LAST MULTI-CASE RUN</div><div class="history">' +
        renderSuite(state.lastSuite) + '</div>'
      : '';

    const lastStress = state.lastStress
      ? '<div class="section-title top">LAST STRESS TEST</div><div class="result">' +
        '<div class="result-head"><strong>' +
        escapeHtml(
          state.lastStress.verdict ||
          (state.lastStress.ok ? 'PASS' : 'FAILED')
        ) +
        '</strong>' +
        (state.lastStress.iteration
          ? ' · iteration ' + Number(state.lastStress.iteration)
          : '') +
        (state.lastStress.iterations
          ? ' · ' + Number(state.lastStress.iterations) + ' iterations'
          : '') +
        '</div>' +
        (state.lastStress.input
          ? '<div class="section-title">FAILING INPUT</div><pre>' +
            escapeHtml(state.lastStress.input) + '</pre>'
          : '') +
        (state.lastStress.bruteOutput
          ? '<div class="section-title">BRUTE OUTPUT</div><pre>' +
            escapeHtml(state.lastStress.bruteOutput) + '</pre>'
          : '') +
        (state.lastStress.optimizedOutput
          ? '<div class="section-title">OPTIMIZED OUTPUT</div><pre>' +
            escapeHtml(state.lastStress.optimizedOutput) + '</pre>'
          : '') +
        (state.lastStress.error
          ? '<pre>' + escapeHtml(state.lastStress.error) + '</pre>'
          : '') +
        '</div>'
      : '';

    const aiBlock = ai.running
      ? '<div class="ai-result">Analyzing…</div>'
      : ai.error
        ? '<div class="ai-result"><strong>AI error</strong><br><br>' +
          escapeHtml(ai.error) + '</div>'
        : ai.result
          ? '<div class="ai-result">' + escapeHtml(ai.result) +
            (ai.model ? '<div class="model">Model: ' + escapeHtml(ai.model) + '</div>' : '') +
            '</div>'
          : '<p class="muted">Complexity and edge-case tools analyze selected code, or the current source file when nothing is selected. Panic Assist reads a copied problem statement and returns hints instead of a full solution.</p>';

    return '<!DOCTYPE html>' +
      '<html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ' +
      webview.cspSource + ' \'unsafe-inline\'; script-src \'nonce-' + n + '\';">' +
      '<style>' +
      ':root{--cyan:#00f7ff;--violet:#8b5cff;--pink:#ff4fd8;--ok:#64ffb4;--warn:#ffcc66;--fail:#ff6b8a;--muted:var(--vscode-descriptionForeground);--panel:color-mix(in srgb,var(--vscode-editor-background) 92%,#050817 8%)}' +
      '*{box-sizing:border-box}body{margin:0;padding:12px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-sideBar-background)}' +
      '.brand{font-size:10px;letter-spacing:.18em;color:var(--cyan);margin-bottom:4px}.hero{padding:14px;border:1px solid rgba(0,247,255,.2);border-radius:14px;background:linear-gradient(135deg,rgba(0,247,255,.04),rgba(139,92,255,.05));margin-bottom:12px}.hero h2{margin:0 0 6px;font-size:18px}.muted{color:var(--muted);font-size:11px;line-height:1.5}' +
      '.actions,.status-actions,.tools,.platforms{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid rgba(0,247,255,.18);border-radius:8px;padding:7px 9px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}' +
      '.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}.stat{padding:10px;border:1px solid rgba(0,247,255,.12);border-radius:10px;background:var(--panel)}.stat span{display:block;font-size:9px;letter-spacing:.11em;color:var(--muted);margin-bottom:5px}.stat strong{font-size:14px}.clock{font-family:var(--vscode-editor-font-family);color:var(--cyan)}' +
      '.section-title{font-size:9px;letter-spacing:.12em;color:var(--muted);margin:10px 0 7px}.section-title.top{margin-top:14px}.problems{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.problem{display:flex;flex-direction:column;gap:3px;text-align:left;background:transparent;color:var(--vscode-foreground);min-width:0}.problem.active{border-color:var(--cyan);background:rgba(0,247,255,.07)}.problem.cp-ac{border-color:rgba(100,255,180,.5)}.problem.cp-fail{border-color:rgba(255,107,138,.5)}.problem.cp-solving{border-color:rgba(255,204,102,.5)}.letter{font-size:16px;font-weight:800;color:var(--cyan)}.problem small{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.runner{display:grid;grid-template-columns:1fr;gap:8px}.run-panel{padding:9px;border:1px solid rgba(139,92,255,.15);border-radius:10px;background:var(--panel)}textarea{width:100%;min-height:110px;margin-top:7px;resize:vertical;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,rgba(0,247,255,.15));border-radius:8px;padding:8px;font-family:var(--vscode-editor-font-family)}' +
      '.result,.ai-result{margin-top:10px;padding:10px;border:1px solid rgba(0,247,255,.13);border-radius:10px;background:var(--panel)}.ai-result{border-color:rgba(255,79,216,.18);white-space:pre-wrap;line-height:1.5}.model{margin-top:8px;color:var(--muted);font-size:10px}.result-head{font-size:11px}pre{white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;background:rgba(0,0,0,.15);padding:8px;border-radius:8px;font-family:var(--vscode-editor-font-family);font-size:11px}.history{display:flex;flex-direction:column;gap:6px}.history-row{display:flex;justify-content:space-between;gap:8px;padding:8px;border:1px solid rgba(0,247,255,.1);border-radius:8px}.history-row div{min-width:0}.history-row strong,.history-row small{display:block}.history-row small{color:var(--muted);margin-top:2px}' +
      '@media(min-width:520px){.summary{grid-template-columns:repeat(5,minmax(0,1fr))}.problems{grid-template-columns:repeat(8,minmax(0,1fr))}.runner{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
      '</style></head><body>' +
      '<div class="brand">MASUM GALAXY // CP ARENA</div>' +
      '<section class="hero"><h2>Contest cockpit · local judge · AI coach</h2>' +
      '<div class="muted">C/C++, Python, and JavaScript. Contest/problem history stays in this extension\'s VS Code storage.</div>' +
      '<div class="actions"><button data-command="cpStartContest">▶ New Contest</button><button data-command="cpStopContest">■ Stop</button><button data-command="cpFocusMode">◎ CP Focus</button><button data-command="cpResetArena">↺ Reset</button><button data-command="refresh">Refresh</button></div></section>' +
      '<div class="summary">' +
      '<div class="stat"><span>CONTEST</span><strong class="clock" id="contestClock" data-running="' +
      (state.contest.running ? '1' : '0') + '" data-end-at="' +
      Number(state.contest.endAt || 0) + '" data-remaining="' +
      Number(state.contest.remainingMs || 0) + '">' +
      escapeHtml(state.contest.remainingText) + '</strong></div>' +
      '<div class="stat"><span>SOLVED</span><strong>' + state.solved + ' / ' + state.total + '</strong></div>' +
      '<div class="stat"><span>CURRENT</span><strong>' + escapeHtml(state.currentProblem) + '</strong></div>' +
      '<div class="stat"><span>PROBLEM TIME</span><strong class="clock" id="problemClock" data-running="' +
      (state.contest.running ? '1' : '0') + '" data-current-ms="' +
      Number((state.problems.find((item) => item.current) || {}).activeMs || 0) + '">' +
      escapeHtml(state.currentProblemTime) + '</strong></div>' +
      '<div class="stat"><span>LAST VERDICT</span><strong>' +
      escapeHtml(state.lastRun && state.lastRun.verdict || '—') + '</strong></div>' +
      '</div>' +
      '<div class="section-title">PROBLEM TRACKER · CLICK TO SWITCH</div><div class="problems">' +
      renderProblems(state.problems) + '</div>' +
      '<div class="section-title">CURRENT PROBLEM ' + escapeHtml(state.currentProblem) + ' · STATE</div>' +
      '<div class="status-actions"><button data-status="SOLVING">Solving</button><button data-status="WA">WA</button><button data-status="TLE">TLE</button><button data-status="RE">RE</button><button data-status="CE">CE</button><button data-status="AC">AC ✓</button><button data-status="NOT STARTED">Reset Status</button></div>' +
      '<div class="section-title">LOCAL SAMPLE JUDGE</div><div class="runner">' +
      '<div class="run-panel"><strong>Sample Input</strong><textarea id="sampleInput" spellcheck="false" placeholder="Paste sample input here...">' +
      escapeHtml(state.lastRun && state.lastRun.input || '') + '</textarea></div>' +
      '<div class="run-panel"><strong>Expected Output</strong><textarea id="sampleExpected" spellcheck="false" placeholder="Paste expected output here...">' +
      escapeHtml(state.lastRun && state.lastRun.expected || '') + '</textarea></div></div>' +
      '<div class="tools"><button id="runSample">▶ Run Sample</button><button data-command="cpStressTest">⚡ Stress Test</button><button data-command="cpNewProblemFile">＋ New Problem File</button><button data-command="cpSnippetVault">⌘ Snippet Vault</button><button data-command="cpAiComplexity">O() Complexity</button><button data-command="cpAiEdgeCases">◇ Edge Cases</button><button data-command="cpPanicAssist">! Panic Assist</button></div>' +
      '<div class="section-title top">MULTI-CASE JUDGE</div>' +
      '<p class="muted">Use dedicated multi-case boxes below. Separate cases with a line containing <code>---</code>.</p>' +
      '<div class="runner">' +
      '<div class="run-panel"><strong>Multi-case Input</strong><textarea id="multiInput" spellcheck="false" placeholder="1 2&#10;---&#10;5 7&#10;---&#10;10 20">' +
      escapeHtml(state.lastSuite && state.lastSuite.rawInput || '') + '</textarea></div>' +
      '<div class="run-panel"><strong>Multi-case Expected Output</strong><textarea id="multiExpected" spellcheck="false" placeholder="3&#10;---&#10;12&#10;---&#10;30">' +
      escapeHtml(state.lastSuite && state.lastSuite.rawExpected || '') + '</textarea></div></div>' +
      '<div class="tools"><button id="runMulti">≋ Run Multi Cases</button></div>' +
      lastRun + lastSuite + lastStress +
      '<div class="section-title top">VERDICT HISTORY</div><div class="history">' +
      renderHistory(state.history) + '</div>' +
      '<div class="section-title top">CP AI COACH</div>' + aiBlock +
      '<div class="section-title top">PLATFORMS</div><div class="platforms"><button data-platform="codeforces">Codeforces ↗</button><button data-platform="atcoder">AtCoder ↗</button><button data-platform="leetcode">LeetCode ↗</button><button data-platform="codechef">CodeChef ↗</button></div>' +
      '<script nonce="' + n + '">' +
      'const vscode=acquireVsCodeApi();' +
      'const send=(command,value)=>vscode.postMessage({command,value});' +
      'document.querySelectorAll("[data-command]").forEach(b=>b.addEventListener("click",()=>send(b.dataset.command)));' +
      'document.querySelectorAll("[data-problem]").forEach(b=>b.addEventListener("click",()=>send("cpSwitchProblem",b.dataset.problem)));' +
      'document.querySelectorAll("[data-status]").forEach(b=>b.addEventListener("click",()=>send("cpSetStatus",b.dataset.status)));' +
      'document.querySelectorAll("[data-platform]").forEach(b=>b.addEventListener("click",()=>send("cpPlatform",b.dataset.platform)));' +
      'document.getElementById("runSample").addEventListener("click",()=>send("cpRunSample",{input:document.getElementById("sampleInput").value,expected:document.getElementById("sampleExpected").value}));' +
      'document.getElementById("runMulti").addEventListener("click",()=>send("cpRunMulti",{input:document.getElementById("multiInput").value,expected:document.getElementById("multiExpected").value}));' +
      'const fmt=(ms)=>{let s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);s%=60;return(h?[h,m,s]:[m,s]).map(v=>String(v).padStart(2,"0")).join(":")};' +
      'const contest=document.getElementById("contestClock");if(contest){const running=contest.dataset.running==="1",end=Number(contest.dataset.endAt||0),initial=Number(contest.dataset.remaining||0);if(running){setInterval(()=>{contest.textContent=fmt(end?Math.max(0,end-Date.now()):initial)},1000)}}' +
      'const problem=document.getElementById("problemClock");if(problem&&problem.dataset.running==="1"){const base=Number(problem.dataset.currentMs||0),start=Date.now();setInterval(()=>{problem.textContent=fmt(base+(Date.now()-start))},1000)}' +
      '</script></body></html>';
  }
}

module.exports = { CpArenaProvider };
