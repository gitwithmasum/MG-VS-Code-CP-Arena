const vscode = require('vscode');
const { CpArenaProvider } = require('./src/arena');

function activate(context) {
  const provider = new CpArenaProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CpArenaProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('masumGalaxyCpArena.open', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.masumGalaxyCpArena');
    }),
    vscode.commands.registerCommand('masumGalaxyCpArena.newContest', () =>
      provider.execute('cpStartContest')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.newProblem', () =>
      provider.execute('cpNewProblemFile')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.stressTest', () =>
      provider.execute('cpStressTest')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.snippets', () =>
      provider.execute('cpSnippetVault')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.focusMode', () =>
      provider.execute('cpFocusMode')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.runLastSample', () =>
      provider.execute('cpRunLastSample')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.runLastMulti', () =>
      provider.execute('cpRunLastMulti')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.markAccepted', () =>
      provider.execute('cpMarkAccepted')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.nextProblem', () =>
      provider.execute('cpNextProblem')
    ),
    vscode.commands.registerCommand('masumGalaxyCpArena.rerunStressFailure', () =>
      provider.execute('cpRerunStressFailure')
    )
  );

  const remember = (editor) => provider.rememberEditor(editor);
  remember(vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(remember),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh())
  );

  provider.startClock();
  context.subscriptions.push({ dispose: () => provider.dispose() });
}

function deactivate() {}

module.exports = { activate, deactivate };
