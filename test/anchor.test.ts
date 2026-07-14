import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { resolveAnchor } from '../src/webview/anchor';

describe('resolveAnchor', () => {
  it('should keep the stored offsets when the selected text is unchanged', () => {
    const result = resolveAnchor('alpha selected omega', {
      selectedText: 'selected',
      startOffset: 6,
      endOffset: 14,
      prefix: 'alpha ',
      suffix: ' omega',
    });

    assert.deepEqual(result, { startOffset: 6, endOffset: 14 });
  });

  it('should recover a moved selection using its surrounding text', () => {
    const result = resolveAnchor('new alpha selected omega', {
      selectedText: 'selected',
      startOffset: 6,
      endOffset: 14,
      prefix: 'alpha ',
      suffix: ' omega',
    });

    assert.deepEqual(result, { startOffset: 10, endOffset: 18 });
  });

  it('should return null when the selected text no longer exists', () => {
    const result = resolveAnchor('alpha replacement omega', {
      selectedText: 'selected',
      startOffset: 6,
      endOffset: 14,
      prefix: 'alpha ',
      suffix: ' omega',
    });

    assert.equal(result, null);
  });

  it('should return null when selected text is empty', () => {
    const result = resolveAnchor('alpha', {
      selectedText: '',
      startOffset: 0,
      endOffset: 0,
      prefix: '',
      suffix: '',
    });

    assert.equal(result, null);
  });
});
