import * as crypto from 'node:crypto';
import * as path from 'node:path';

import type * as vscodeTypes from 'vscode';

import { formatAnnotations } from './annotation-formatter';
import { renderMarkdown } from './markdown-renderer';
import { getWebviewHtml } from './webview-html';
import type { Annotation, Prefs, WebviewToHostMessage } from './types';

const OPEN_PREVIEW_COMMAND = 'markdownPreviewAnnotator.openPreview';
const CONFIG_SECTION = 'markdownPreviewAnnotator';
const PREF_KEYS: Array<keyof Prefs> = ['fontSize', 'fontFamily', 'lineHeight', 'contentWidth'];

function readPrefs(vscode: typeof vscodeTypes): Prefs {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    fontSize: config.get('fontSize', 14),
    fontFamily: config.get('fontFamily', 'theme'),
    lineHeight: config.get('lineHeight', 'normal'),
    contentWidth: config.get('contentWidth', 'full'),
  };
}

export function activate(
  context: vscodeTypes.ExtensionContext,
  injectedApi?: typeof vscodeTypes,
): void {
  const vscode = injectedApi ?? (require('vscode') as typeof vscodeTypes);
  const panels = new Map<string, vscodeTypes.WebviewPanel>();

  const command = vscode.commands.registerCommand(OPEN_PREVIEW_COMMAND, async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      vscode.window.showInformationMessage('Markdownファイルを開いてから実行してください。');
      return;
    }

    const document = editor.document;
    const documentKey = document.uri.toString();
    const existingPanel = panels.get(documentKey);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    const filePath = vscode.workspace.asRelativePath(document.uri, false);
    const storageKey = `markdownPreviewAnnotator.annotations:${documentKey}`;
    const initialAnnotations = context.workspaceState.get<Annotation[]>(storageKey, []);
    const panel = vscode.window.createWebviewPanel(
      'markdownPreviewAnnotator.preview',
      `Annotations: ${path.basename(document.fileName)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panels.set(documentKey, panel);

    const mainScriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js'),
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css'),
    );

    panel.webview.html = getWebviewHtml({
      cspSource: panel.webview.cspSource,
      mainScriptUri: mainScriptUri.toString(),
      styleUri: styleUri.toString(),
      renderedMarkdown: renderMarkdown(document.getText()),
      documentTitle: path.basename(document.fileName),
      filePath,
      initialAnnotations: Array.isArray(initialAnnotations) ? initialAnnotations : [],
      prefs: readPrefs(vscode),
      nonce: crypto.randomBytes(18).toString('base64url'),
    });

    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== documentKey) {
        return;
      }
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        panel.webview.postMessage({
          type: 'sourceUpdate',
          html: renderMarkdown(event.document.getText()),
        });
      }, 70);
    });

    const configDisposable = vscode.workspace.onDidChangeConfiguration?.((event) => {
      if (event.affectsConfiguration && !event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      panel.webview.postMessage({ type: 'prefsUpdate', prefs: readPrefs(vscode) });
    });

    const messageDisposable = panel.webview.onDidReceiveMessage(
      async (message: WebviewToHostMessage) => {
        if (message.type === 'persist' && Array.isArray(message.annotations)) {
          await context.workspaceState.update(storageKey, message.annotations);
          return;
        }

        if (message.type === 'updatePrefs' && message.prefs) {
          const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
          const target = vscode.ConfigurationTarget?.Global ?? true;
          for (const key of PREF_KEYS) {
            const value = message.prefs[key];
            if (value !== undefined && config.get(key) !== value) {
              await config.update?.(key, value, target);
            }
          }
          return;
        }

        if (message.type === 'copy') {
          try {
            const text = formatAnnotations({
              filePath,
              annotations: message.annotations,
            });
            await vscode.env.clipboard.writeText(text);
            await panel.webview.postMessage({
              type: 'copySucceeded',
              message: `${message.annotations.length}件のコメントをコピーしました。`,
            });
          } catch (error) {
            await panel.webview.postMessage({
              type: 'copyFailed',
              message: error instanceof Error ? error.message : 'コピーに失敗しました。',
            });
          }
          return;
        }

        if (message.type === 'copyCode' && typeof message.code === 'string') {
          await vscode.env.clipboard.writeText(message.code);
          await panel.webview.postMessage({
            type: 'copySucceeded',
            message: 'コードブロックをコピーしました。',
          });
          return;
        }

        if (message.type === 'reveal') {
          const startLine = Math.max(0, Math.min(document.lineCount - 1, message.startLine - 1));
          const endLine = Math.max(startLine, Math.min(document.lineCount - 1, message.endLine - 1));
          const start = document.lineAt(startLine).range.start;
          const end = document.lineAt(endLine).range.end;
          const sourceEditor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
          const range = new vscode.Range(start, end);
          sourceEditor.selection = new vscode.Selection(start, end);
          sourceEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          return;
        }

        if (message.type === 'openLink') {
          const uri = vscode.Uri.parse(message.href);
          if (['http', 'https', 'mailto'].includes(uri.scheme)) {
            await vscode.env.openExternal(uri);
          }
        }
      },
    );

    panel.onDidDispose(() => {
      clearTimeout(updateTimer);
      changeDisposable.dispose();
      configDisposable?.dispose();
      messageDisposable.dispose();
      panels.delete(documentKey);
    });
  });

  context.subscriptions.push(command);
}
