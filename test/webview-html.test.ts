import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { getWebviewHtml, sanitizePrefs, type WebviewHtmlOptions } from '../src/webview-html';

const baseOptions: WebviewHtmlOptions = {
  cspSource: 'webview:',
  mainScriptUri: 'webview://main.js',
  mermaidScriptUri: 'webview://mermaid.min.js',
  styleUri: 'webview://styles.css',
  renderedMarkdown: '<h1>Preview</h1>',
  documentTitle: 'README.md',
  filePath: 'README.md',
  initialAnnotations: [],
  prefs: { fontSize: 14, fontFamily: 'theme', lineHeight: 'normal', contentWidth: 'full' },
  nonce: 'fixed-nonce',
};

describe('getWebviewHtml', () => {
  it('should enforce a nonce-based content security policy', () => {
    const html = getWebviewHtml(baseOptions);

    assert.match(html, /script-src 'nonce-fixed-nonce'/);
  });

  it('should render Markdown inside the preview article', () => {
    const html = getWebviewHtml(baseOptions);

    assert.match(html, /<article id="preview" class="markdown-body"><h1>Preview<\/h1><\/article>/);
  });

  it('should escape closing script text in boot data', () => {
    const html = getWebviewHtml({
      ...baseOptions,
      filePath: '</script><script>alert(1)</script>',
    });

    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it('should apply the configured content width', () => {
    const html = getWebviewHtml({
      ...baseOptions,
      prefs: { ...baseOptions.prefs, contentWidth: 'readable' },
    });

    assert.match(html, /<body class="width-readable">/);
  });

  it('should load the mermaid runtime with the shared nonce', () => {
    const html = getWebviewHtml(baseOptions);

    assert.match(html, /<script src="webview:\/\/mermaid\.min\.js" nonce="fixed-nonce"><\/script>/);
  });

  it('should include the display settings popover', () => {
    const html = getWebviewHtml(baseOptions);

    assert.match(html, /id="display-toggle"/);
    assert.match(html, /id="font-family-select"/);
  });

  it('should include the selection bubble trigger', () => {
    const html = getWebviewHtml(baseOptions);

    assert.match(html, /id="selection-bubble"/);
  });

  it('should not reference the removed github stylesheet', () => {
    const html = getWebviewHtml(baseOptions);

    assert.doesNotMatch(html, /github-markdown/);
  });

  it('should serialize preferences into boot data', () => {
    const html = getWebviewHtml({
      ...baseOptions,
      prefs: { fontSize: 18, fontFamily: 'serif', lineHeight: 'relaxed', contentWidth: 'full' },
    });

    assert.match(html, /"prefs":\{"fontSize":18,"fontFamily":"serif"/);
  });
});

describe('sanitizePrefs', () => {
  it('should fall back to defaults for invalid values', () => {
    assert.deepEqual(
      sanitizePrefs({ fontSize: Number.NaN, fontFamily: 'comic-sans' as never }),
      {
        fontSize: 14,
        fontFamily: 'theme',
        lineHeight: 'normal',
        contentWidth: 'full',
      },
    );
  });

  it('should clamp the font size into the supported range', () => {
    assert.equal(sanitizePrefs({ fontSize: 90 }).fontSize, 28);
    assert.equal(sanitizePrefs({ fontSize: 4 }).fontSize, 10);
  });
});
