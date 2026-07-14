import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../src/markdown-renderer';

describe('renderMarkdown', () => {
  it('should add source line metadata to rendered blocks', () => {
    const html = renderMarkdown('# Title\n\nParagraph');

    assert.match(
      html,
      /<h1 data-source-line-start="1" data-source-line-end="1">Title<\/h1>/,
    );
  });

  it('should render a GitHub Flavored Markdown table', () => {
    const html = renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |');

    assert.match(html, /<table[\s>]/);
  });

  it('should wrap tables in a horizontally scrollable container', () => {
    const html = renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |');

    assert.match(html, /<div class="table-wrap"><table[\s>]/);
    assert.match(html, /<\/table>\n<\/div>/);
  });

  it('should highlight fenced code with the requested language', () => {
    const html = renderMarkdown('```js\nconst answer = 42;\n```');

    assert.match(html, /<figure class="code-figure"[^>]*data-code-lang="js"/);
    assert.match(html, /class="hljs language-js"/);
    assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  });

  it('should keep source line metadata on fenced code blocks', () => {
    const html = renderMarkdown('# Title\n\n```js\nconst x = 1;\n```');

    assert.match(html, /<figure class="code-figure" data-source-line-start="3" data-source-line-end="5"/);
  });

  it('should escape code fences without a known language', () => {
    const html = renderMarkdown('```\n<b>plain</b>\n```');

    assert.match(html, /data-code-lang="text"/);
    assert.match(html, /&lt;b&gt;plain&lt;\/b&gt;/);
  });

  it('should emit mermaid fences as renderable figures with escaped source', () => {
    const html = renderMarkdown('```mermaid\ngraph TD;\nA-->B;\n```');

    assert.match(html, /<figure class="mermaid-figure"/);
    assert.match(html, /<pre class="mermaid-source">graph TD;\nA--&gt;B;\n<\/pre>/);
    assert.doesNotMatch(html, /class="code-figure"/);
  });

  it('should escape raw HTML from Markdown documents', () => {
    const html = renderMarkdown('<script>alert(1)</script>');

    assert.doesNotMatch(html, /<script>/);
  });

  it('should render task list items as disabled checkboxes', () => {
    const html = renderMarkdown('- [x] shipped');

    assert.match(html, /<input class="task-list-item-checkbox" checked disabled type="checkbox">/);
  });

  it('should keep bracket text in a normal paragraph', () => {
    const html = renderMarkdown('[x] this is not a list item');

    assert.match(html, /<p[^>]*>\[x\] this is not a list item<\/p>/);
  });
});
