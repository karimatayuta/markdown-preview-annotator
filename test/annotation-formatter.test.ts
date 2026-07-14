import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { formatAnnotations } from '../src/annotation-formatter';

describe('formatAnnotations', () => {
  it('should create an AI-ready Markdown review when one annotation is supplied', () => {
    const result = formatAnnotations({
      filePath: 'docs/spec.md',
      annotations: [
        {
          selectedText: 'Retry forever.',
          comment: '再試行回数の上限を決めてください。',
          startLine: 8,
          endLine: 8,
        },
      ],
    });

    assert.equal(
      result,
      [
        '# Markdown review comments',
        '',
        'File: `docs/spec.md`',
        '',
        'Apply the following comments to the Markdown document.',
        '',
        '## Comment 1',
        '',
        'Location: line 8',
        '',
        'Selected text:',
        '> Retry forever.',
        '',
        'Comment:',
        '再試行回数の上限を決めてください。',
      ].join('\n'),
    );
  });

  it('should quote every selected line when selected text is multiline', () => {
    const result = formatAnnotations({
      filePath: 'README.md',
      annotations: [
        {
          selectedText: 'first\n\nthird',
          comment: '短くしてください。',
          startLine: 2,
          endLine: 4,
        },
      ],
    });

    assert.match(result, /Selected text:\n> first\n>\n> third/);
  });

  it('should reject an empty annotation list', () => {
    assert.throws(
      () => formatAnnotations({ filePath: 'README.md', annotations: [] }),
      /No annotations to copy/,
    );
  });

  it('should reject an annotation with a blank comment', () => {
    assert.throws(
      () =>
        formatAnnotations({
          filePath: 'README.md',
          annotations: [{ selectedText: 'text', comment: '  ', startLine: 1, endLine: 1 }],
        }),
      /Annotation comment is required/,
    );
  });
});
