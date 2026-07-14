import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { initializeWebview, type WebviewWindow } from '../src/webview/main';
import type { Annotation, Prefs, WebviewToHostMessage } from '../src/types';

function createEnvironment(
  initialAnnotations: Annotation[] = [],
  prefs?: Partial<Prefs>,
) {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="display-toggle"></button>
    <div id="display-settings" class="hidden">
      <button id="font-decrease"></button>
      <span id="font-size-value"></span>
      <button id="font-increase"></button>
      <select id="font-family-select">
        <option value="theme">テーマ標準</option>
        <option value="sans">ゴシック</option>
        <option value="serif">明朝</option>
        <option value="mono">等幅</option>
      </select>
      <select id="line-height-select">
        <option value="compact">つめる</option>
        <option value="normal">標準</option>
        <option value="relaxed">ゆったり</option>
      </select>
      <select id="content-width-select">
        <option value="full">画面いっぱい</option>
        <option value="readable">読みやすい幅</option>
      </select>
    </div>
    <button id="clear-all" disabled></button>
    <button id="copy-all" disabled></button>
    <article id="preview"><p data-source-line-start="1" data-source-line-end="1">Selected text</p></article>
    <span id="annotation-count"></span>
    <p id="empty-state"></p>
    <ol id="annotation-list"></ol>
    <button id="selection-bubble" class="hidden"></button>
    <form id="composer" class="hidden">
      <blockquote id="composer-quote"></blockquote>
      <textarea id="comment-input"></textarea>
      <button id="cancel-comment" type="button"></button>
    </form>
    <div id="toast"></div>
    <script id="boot-data" type="application/json">${JSON.stringify({
      filePath: 'README.md',
      initialAnnotations,
      prefs,
    })}</script>
  </body>`, { url: 'https://webview.local/' });
  const messages: WebviewToHostMessage[] = [];
  const state: { value: unknown } = { value: undefined };
  const win = dom.window as unknown as WebviewWindow & {
    acquireVsCodeApi: unknown;
  };
  win.acquireVsCodeApi = () => ({
    getState: () => state.value as ReturnType<ReturnType<WebviewWindow['acquireVsCodeApi']>['getState']>,
    setState: (value: unknown) => {
      state.value = value;
    },
    postMessage: (message: WebviewToHostMessage) => messages.push(message),
  });
  initializeWebview(win);
  return { window: dom.window, messages, state };
}

function selectPreviewText(window: JSDOM['window']) {
  const textNode = window.document.querySelector('#preview p')!.firstChild!;
  const range = window.document.createRange();
  range.selectNodeContents(textNode);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  textNode.parentElement!.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
}

const persistedAnnotation: Annotation = {
  id: 'saved',
  selectedText: 'Selected',
  comment: '言い換えてください。',
  startOffset: 0,
  endOffset: 8,
  prefix: '',
  suffix: ' text',
  startLine: 1,
  endLine: 1,
};

describe('initializeWebview', () => {
  it('should render annotations restored from extension storage', () => {
    const { window } = createEnvironment([persistedAnnotation]);

    assert.equal(window.document.querySelector('#annotation-count')!.textContent, '1');
  });

  it('should request an AI-ready copy when the copy button is clicked', () => {
    const { window, messages } = createEnvironment([persistedAnnotation]);

    (window.document.querySelector('#copy-all') as HTMLButtonElement).click();

    assert.deepEqual(messages.at(-1), {
      type: 'copy',
      annotations: [persistedAnnotation],
    });
  });

  it('should remove all annotations when clear is clicked', () => {
    const { window } = createEnvironment([persistedAnnotation]);

    (window.document.querySelector('#clear-all') as HTMLButtonElement).click();

    assert.equal(window.document.querySelector('#annotation-count')!.textContent, '0');
  });

  it('should show the comment bubble when preview text is selected', () => {
    const { window } = createEnvironment();

    selectPreviewText(window);

    const bubble = window.document.querySelector('#selection-bubble')!;
    assert.equal(bubble.classList.contains('hidden'), false);
    assert.equal(window.document.querySelector('#composer')!.classList.contains('hidden'), true);
  });

  it('should open the composer when the bubble is clicked', () => {
    const { window } = createEnvironment();

    selectPreviewText(window);
    (window.document.querySelector('#selection-bubble') as HTMLButtonElement).click();

    assert.equal(window.document.querySelector('#composer')!.classList.contains('hidden'), false);
    assert.equal(
      window.document.querySelector('#selection-bubble')!.classList.contains('hidden'),
      true,
    );
  });

  it('should quote the selected text inside the composer', () => {
    const { window } = createEnvironment();

    selectPreviewText(window);
    (window.document.querySelector('#selection-bubble') as HTMLButtonElement).click();

    assert.equal(
      window.document.querySelector('#composer-quote')!.textContent,
      'Selected text',
    );
  });

  it('should remove fallback centering when positioning the composer by selection', () => {
    const { window } = createEnvironment();

    selectPreviewText(window);
    (window.document.querySelector('#selection-bubble') as HTMLButtonElement).click();

    assert.equal(
      (window.document.querySelector('#composer') as HTMLElement).style.transform,
      'none',
    );
  });

  it('should add a comment for the selected preview text', () => {
    const { window } = createEnvironment();
    selectPreviewText(window);
    (window.document.querySelector('#selection-bubble') as HTMLButtonElement).click();
    (window.document.querySelector('#comment-input') as HTMLTextAreaElement).value =
      '短くしてください。';

    window.document.querySelector('#composer')!.dispatchEvent(
      new window.SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );

    assert.equal(window.document.querySelector('#annotation-count')!.textContent, '1');
  });

  it('should allow editing an existing comment', () => {
    const { window } = createEnvironment([structuredClone(persistedAnnotation)]);
    const editButton = [
      ...window.document.querySelectorAll<HTMLButtonElement>('.annotation-card-actions button'),
    ].find((button) => button.textContent === '編集')!;

    editButton.click();
    const editor = window.document.querySelector('.annotation-edit') as HTMLTextAreaElement;
    editor.value = '文体を統一してください。';
    [...window.document.querySelectorAll<HTMLButtonElement>('.annotation-card-actions button')]
      .find((button) => button.textContent === '保存')!
      .click();

    const comment = window.document.querySelector('.annotation-card p')!;
    assert.equal(comment.textContent, '文体を統一してください。');
  });

  it('should apply boot preferences as typography custom properties', () => {
    const { window } = createEnvironment([], {
      fontSize: 18,
      fontFamily: 'serif',
      lineHeight: 'relaxed',
      contentWidth: 'readable',
    });

    const rootStyle = window.document.documentElement.style;
    assert.equal(rootStyle.getPropertyValue('--mpa-font-size'), '18px');
    assert.match(rootStyle.getPropertyValue('--mpa-font-family'), /Mincho|Serif/);
    assert.equal(window.document.body.classList.contains('width-readable'), true);
  });

  it('should post updated preferences when the font size is increased', () => {
    const { window, messages } = createEnvironment();

    (window.document.querySelector('#font-increase') as HTMLButtonElement).click();

    const prefsMessage = messages.findLast((message) => message.type === 'updatePrefs');
    assert.equal(prefsMessage?.type === 'updatePrefs' && prefsMessage.prefs.fontSize, 15);
    assert.equal(
      window.document.documentElement.style.getPropertyValue('--mpa-font-size'),
      '15px',
    );
  });

  it('should toggle the display settings panel from the toolbar', () => {
    const { window } = createEnvironment();
    const panel = window.document.querySelector('#display-settings')!;

    (window.document.querySelector('#display-toggle') as HTMLButtonElement).click();

    assert.equal(panel.classList.contains('hidden'), false);
  });

  it('should request a code copy when the code copy button is clicked', () => {
    const { window, messages } = createEnvironment();
    const preview = window.document.querySelector('#preview')!;
    preview.innerHTML =
      '<figure class="code-figure" data-code-lang="js">' +
      '<button class="code-copy" type="button"></button>' +
      '<pre><code>const x = 1;\n</code></pre></figure>';

    (preview.querySelector('.code-copy') as HTMLButtonElement).click();

    assert.deepEqual(messages.at(-1), { type: 'copyCode', code: 'const x = 1;\n' });
  });
});
