import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { renderModernMermaid } from '../src/webview/beautiful-mermaid';

describe('renderModernMermaid', () => {
  it('should render a supported Mermaid flowchart as SVG', () => {
    const svg = renderModernMermaid('flowchart LR\n  A[Start] --> B[Finish]');

    assert.match(svg, /^<svg\b/);
  });

  it('should bind diagram colors to the active VS Code theme', () => {
    const svg = renderModernMermaid('flowchart LR\n  A --> B');

    assert.match(svg, /var\(--vscode-editor-background\)/);
  });

  it('should not request an external Google font from the webview', () => {
    const svg = renderModernMermaid('flowchart LR\n  A --> B');

    assert.doesNotMatch(svg, /fonts\.googleapis\.com/);
  });

  it('should use the configured preview font inside the SVG', () => {
    const svg = renderModernMermaid('flowchart LR\n  A --> B');

    assert.match(svg, /font-family:\s*var\(--mpa-font-family/);
  });

  it('should reject an empty Mermaid source', () => {
    assert.throws(() => renderModernMermaid('  \n'), /Mermaid source is required/);
  });
});
