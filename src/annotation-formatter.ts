import type { Annotation } from './types';

export type FormattableAnnotation = Pick<
  Annotation,
  'selectedText' | 'comment' | 'startLine' | 'endLine'
>;

export function formatAnnotations({
  filePath,
  annotations,
}: {
  filePath: string;
  annotations: FormattableAnnotation[];
}): string {
  if (!Array.isArray(annotations) || annotations.length === 0) {
    throw new TypeError('No annotations to copy');
  }

  const sections = annotations.map((annotation, index) => {
    const comment = annotation.comment?.trim();
    if (!comment) {
      throw new TypeError('Annotation comment is required');
    }

    const location =
      annotation.startLine === annotation.endLine
        ? `line ${annotation.startLine}`
        : `lines ${annotation.startLine}-${annotation.endLine}`;
    const quote = String(annotation.selectedText)
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');

    return [
      `## Comment ${index + 1}`,
      '',
      `Location: ${location}`,
      '',
      'Selected text:',
      quote,
      '',
      'Comment:',
      comment,
    ].join('\n');
  });

  return [
    '# Markdown review comments',
    '',
    `File: \`${filePath}\``,
    '',
    'Apply the following comments to the Markdown document.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}
