import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import manifest from '../package.json';

const vscodeIgnore = readFileSync(new URL('../.vscodeignore', import.meta.url), 'utf8');

describe('extension manifest', () => {
  it('should activate only when the preview command is invoked', () => {
    assert.deepEqual(manifest.activationEvents, [
      'onCommand:markdownPreviewAnnotator.openPreview',
    ]);
  });

  it('should load the bundled extension entry point', () => {
    assert.equal(manifest.main, './dist/extension.js');
  });

  it('should contribute the annotatable preview command', () => {
    assert.equal(
      manifest.contributes.commands[0]?.command,
      'markdownPreviewAnnotator.openPreview',
    );
  });

  it('should show the preview action for Markdown editors', () => {
    assert.equal(
      manifest.contributes.menus['editor/title'][0]?.when,
      'resourceLangId == markdown',
    );
  });

  it('should use the full preview width by default', () => {
    assert.equal(
      manifest.contributes.configuration.properties['markdownPreviewAnnotator.contentWidth']
        .default,
      'full',
    );
  });

  it('should expose typography settings with sensible defaults', () => {
    const properties = manifest.contributes.configuration.properties;

    assert.equal(properties['markdownPreviewAnnotator.fontSize'].default, 14);
    assert.equal(properties['markdownPreviewAnnotator.fontFamily'].default, 'theme');
    assert.equal(properties['markdownPreviewAnnotator.lineHeight'].default, 'normal');
  });

  it('should minify the bundled webview renderer', () => {
    assert.match(manifest.scripts['build:webview'], /--minify/);
  });

  it('should exclude the removed legacy Mermaid runtime from VSIX packages', () => {
    assert.match(vscodeIgnore, /^media\/mermaid\.min\.js$/m);
  });

  it('should exclude browser verification screenshots from VSIX packages', () => {
    assert.match(vscodeIgnore, /^docs\/screenshots\/\*\*$/m);
  });
});
