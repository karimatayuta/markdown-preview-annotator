import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import type * as vscodeTypes from 'vscode';

import { activate } from '../src/extension';
import type { WebviewToHostMessage } from '../src/types';

type MessageHandler = (message: WebviewToHostMessage) => Promise<void> | void;

function createApi() {
  const registered = new Map<string, () => Promise<void>>();
  const infoMessages: string[] = [];
  const configUpdates: Array<{ key: string; value: unknown }> = [];
  const configValues: Record<string, unknown> = {};
  let clipboardText: string | undefined;
  let messageHandler: MessageHandler | undefined;
  let panelOptions: Record<string, unknown> | undefined;
  const panel = {
    webview: {
      cspSource: 'webview:',
      html: '',
      asWebviewUri: (uri: unknown) => uri,
      onDidReceiveMessage: (handler: MessageHandler) => {
        messageHandler = handler;
        return { dispose() {} };
      },
      postMessage: async () => true,
    },
    onDidDispose: () => ({ dispose() {} }),
    reveal() {},
  };
  const api = {
    commands: {
      registerCommand: (id: string, callback: () => Promise<void>) => {
        registered.set(id, callback);
        return { dispose() {} };
      },
    },
    env: {
      clipboard: {
        writeText: async (text: string) => {
          clipboardText = text;
        },
      },
      openExternal: async () => true,
    },
    Uri: {
      joinPath: (...parts: unknown[]) => ({
        toString: () => parts.map(String).join('/'),
      }),
      parse: (value: string) => ({ scheme: new URL(value).protocol.slice(0, -1) }),
    },
    ViewColumn: { One: 1, Beside: 2 },
    window: {
      activeTextEditor: undefined as unknown,
      createWebviewPanel: (
        _viewType: string,
        _title: string,
        _column: number,
        options: Record<string, unknown>,
      ) => {
        panelOptions = options;
        return panel;
      },
      showInformationMessage: (message: string) => infoMessages.push(message),
      showTextDocument: async () => ({ revealRange() {} }),
    },
    workspace: {
      asRelativePath: () => 'README.md',
      getConfiguration: () => ({
        get: (key: string, fallback?: unknown) => configValues[key] ?? fallback,
        update: async (key: string, value: unknown) => {
          configValues[key] = value;
          configUpdates.push({ key, value });
        },
      }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
    },
    ConfigurationTarget: { Global: 1 },
    Range: class Range {},
    Selection: class Selection {},
    TextEditorRevealType: { InCenter: 0 },
  };
  return {
    api: api as unknown as typeof vscodeTypes,
    rawApi: api,
    clipboardText: () => clipboardText,
    configUpdates,
    infoMessages,
    panel,
    panelOptions: () => panelOptions,
    messageHandler: () => messageHandler!,
    registered,
  };
}

function createContext() {
  return {
    extensionUri: { toString: () => 'extension-root' },
    subscriptions: [],
    workspaceState: {
      get: () => [],
      update: async () => {},
    },
  } as unknown as vscodeTypes.ExtensionContext;
}

const markdownEditor = {
  document: {
    fileName: '/workspace/README.md',
    languageId: 'markdown',
    getText: () => '# Preview',
    uri: {
      fsPath: '/workspace/README.md',
      toString: () => 'file:///workspace/README.md',
    },
  },
};

describe('activate', () => {
  it('should register the annotatable preview command', () => {
    const { api, registered } = createApi();

    activate(createContext(), api);

    assert.equal(registered.has('markdownPreviewAnnotator.openPreview'), true);
  });

  it('should explain when no Markdown editor is active', async () => {
    const { api, infoMessages, registered } = createApi();
    activate(createContext(), api);

    await registered.get('markdownPreviewAnnotator.openPreview')!();

    assert.equal(infoMessages[0], 'Markdownファイルを開いてから実行してください。');
  });

  it('should render the active Markdown document in a side panel', async () => {
    const { api, rawApi, panel, registered } = createApi();
    rawApi.window.activeTextEditor = markdownEditor;
    activate(createContext(), api);

    await registered.get('markdownPreviewAnnotator.openPreview')!();

    assert.match(panel.webview.html, /<article id="preview" class="markdown-body"><h1/);
  });

  it('should allow VS Code to release a hidden preview from memory', async () => {
    const { api, rawApi, panelOptions, registered } = createApi();
    rawApi.window.activeTextEditor = markdownEditor;
    activate(createContext(), api);

    await registered.get('markdownPreviewAnnotator.openPreview')!();

    assert.equal(panelOptions()?.['retainContextWhenHidden'], undefined);
  });

  it('should copy annotations through the VS Code clipboard API', async () => {
    const { api, rawApi, clipboardText, messageHandler, registered } = createApi();
    rawApi.window.activeTextEditor = markdownEditor;
    activate(createContext(), api);
    await registered.get('markdownPreviewAnnotator.openPreview')!();

    await messageHandler()({
      type: 'copy',
      annotations: [
        {
          id: 'a1',
          selectedText: 'Preview',
          comment: '見出しを具体的にしてください。',
          startOffset: 0,
          endOffset: 7,
          prefix: '',
          suffix: '',
          startLine: 1,
          endLine: 1,
        },
      ],
    });

    assert.match(clipboardText()!, /Comment:\n見出しを具体的にしてください。/);
  });

  it('should persist display preferences into the user configuration', async () => {
    const { api, rawApi, configUpdates, messageHandler, registered } = createApi();
    rawApi.window.activeTextEditor = markdownEditor;
    activate(createContext(), api);
    await registered.get('markdownPreviewAnnotator.openPreview')!();

    await messageHandler()({
      type: 'updatePrefs',
      prefs: { fontSize: 18, fontFamily: 'serif', lineHeight: 'relaxed', contentWidth: 'readable' },
    });

    assert.deepEqual(configUpdates, [
      { key: 'fontSize', value: 18 },
      { key: 'fontFamily', value: 'serif' },
      { key: 'lineHeight', value: 'relaxed' },
      { key: 'contentWidth', value: 'readable' },
    ]);
  });

  it('should copy code block contents through the VS Code clipboard API', async () => {
    const { api, rawApi, clipboardText, messageHandler, registered } = createApi();
    rawApi.window.activeTextEditor = markdownEditor;
    activate(createContext(), api);
    await registered.get('markdownPreviewAnnotator.openPreview')!();

    await messageHandler()({ type: 'copyCode', code: 'const answer = 42;\n' });

    assert.equal(clipboardText(), 'const answer = 42;\n');
  });
});
