import type { Annotation, Prefs } from './types';

const FONT_FAMILIES = new Set(['theme', 'sans', 'serif', 'mono']);
const LINE_HEIGHTS = new Set(['compact', 'normal', 'relaxed']);

export interface WebviewHtmlOptions {
  cspSource: string;
  mainScriptUri: string;
  styleUri: string;
  renderedMarkdown: string;
  documentTitle: string;
  filePath: string;
  initialAnnotations: Annotation[];
  prefs?: Partial<Prefs> | undefined;
  nonce: string;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

export function sanitizePrefs(prefs: Partial<Prefs> = {}): Prefs {
  const fontSize = Number(prefs.fontSize);
  return {
    fontSize: Number.isFinite(fontSize) ? Math.min(28, Math.max(10, Math.round(fontSize))) : 14,
    fontFamily:
      prefs.fontFamily && FONT_FAMILIES.has(prefs.fontFamily) ? prefs.fontFamily : 'theme',
    lineHeight:
      prefs.lineHeight && LINE_HEIGHTS.has(prefs.lineHeight) ? prefs.lineHeight : 'normal',
    contentWidth: prefs.contentWidth === 'readable' ? 'readable' : 'full',
  };
}

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const prefs = sanitizePrefs(options.prefs);
  const bootData = safeJson({
    documentTitle: options.documentTitle,
    filePath: options.filePath,
    initialAnnotations: options.initialAnnotations,
    prefs,
  });
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; style-src ${options.cspSource} 'unsafe-inline'; font-src ${options.cspSource} data:; script-src 'nonce-${options.nonce}';">
  <link rel="stylesheet" href="${options.styleUri}">
  <title>${escapeHtml(options.documentTitle)}</title>
</head>
<body class="width-${prefs.contentWidth}">
  <header class="toolbar">
    <div class="toolbar-title">
      <strong>${escapeHtml(options.documentTitle)}</strong>
      <span>文章を選択してコメントを追加</span>
    </div>
    <div class="toolbar-actions">
      <div class="display-settings-wrap">
        <button id="display-toggle" class="secondary" type="button" title="表示設定" aria-haspopup="true" aria-expanded="false">Aa <span class="display-toggle-label">表示</span></button>
        <div id="display-settings" class="display-settings hidden" role="group" aria-label="表示設定">
          <div class="setting-row">
            <span class="setting-label">文字サイズ</span>
            <div class="stepper">
              <button id="font-decrease" type="button" aria-label="文字を小さく">−</button>
              <span id="font-size-value">${prefs.fontSize}px</span>
              <button id="font-increase" type="button" aria-label="文字を大きく">＋</button>
            </div>
          </div>
          <div class="setting-row">
            <label class="setting-label" for="font-family-select">フォント</label>
            <select id="font-family-select">
              <option value="theme">テーマ標準</option>
              <option value="sans">ゴシック</option>
              <option value="serif">明朝</option>
              <option value="mono">等幅</option>
            </select>
          </div>
          <div class="setting-row">
            <label class="setting-label" for="line-height-select">行間</label>
            <select id="line-height-select">
              <option value="compact">つめる</option>
              <option value="normal">標準</option>
              <option value="relaxed">ゆったり</option>
            </select>
          </div>
          <div class="setting-row">
            <label class="setting-label" for="content-width-select">本文幅</label>
            <select id="content-width-select">
              <option value="full">画面いっぱい</option>
              <option value="readable">読みやすい幅</option>
            </select>
          </div>
        </div>
      </div>
      <button id="clear-all" class="secondary" type="button" disabled>すべて削除</button>
      <button id="copy-all" type="button" disabled>コメントをコピー</button>
    </div>
  </header>
  <div class="workspace">
    <main class="preview-pane">
      <article id="preview" class="markdown-body">${options.renderedMarkdown}</article>
    </main>
    <aside class="annotations-pane" aria-label="コメント一覧">
      <div class="annotations-heading">
        <h2>コメント</h2>
        <span id="annotation-count">0</span>
      </div>
      <p id="empty-state">本文を選択するとコメントを付けられます。</p>
      <ol id="annotation-list"></ol>
    </aside>
  </div>
  <button id="selection-bubble" class="selection-bubble hidden" type="button">
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1.5c-3.7 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2-.1.8-.5 1.6-1.2 2.3a.5.5 0 0 0 .4.85c1.5-.05 2.8-.6 3.7-1.3.4.05.8.1 1.2.1 3.7 0 6.5-2.4 6.5-5.4S11.7 1.5 8 1.5z"/></svg>
    <span>コメント</span>
  </button>
  <form id="composer" class="composer hidden" aria-label="コメントを追加">
    <div class="composer-header">コメントを追加</div>
    <blockquote id="composer-quote"></blockquote>
    <textarea id="comment-input" rows="3" required placeholder="コメントを入力…" aria-label="選択箇所へのコメント"></textarea>
    <div class="composer-footer">
      <span class="composer-hint">⌘⏎で追加 / Escで閉じる</span>
      <div class="composer-actions">
        <button id="cancel-comment" class="secondary" type="button">キャンセル</button>
        <button type="submit">追加</button>
      </div>
    </div>
  </form>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script id="boot-data" type="application/json" nonce="${options.nonce}">${bootData}</script>
  <script src="${options.mainScriptUri}" nonce="${options.nonce}"></script>
</body>
</html>`;
}
