import type { AnnotationAnchorInput } from '../types';

export interface ResolvedAnchor {
  startOffset: number;
  endOffset: number;
}

export function resolveAnchor(
  text: string,
  annotation: AnnotationAnchorInput,
): ResolvedAnchor | null {
  const selectedText = annotation.selectedText;
  if (!selectedText) {
    return null;
  }

  const storedText = text.slice(annotation.startOffset, annotation.endOffset);
  if (storedText === selectedText) {
    return {
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
    };
  }

  const candidates: Array<ResolvedAnchor & { score: number; distance: number }> = [];
  let position = text.indexOf(selectedText);
  while (position !== -1) {
    const prefixStart = Math.max(0, position - annotation.prefix.length);
    const prefixMatches = text.slice(prefixStart, position).endsWith(annotation.prefix);
    const suffixStart = position + selectedText.length;
    const suffixMatches = text.slice(suffixStart).startsWith(annotation.suffix);
    candidates.push({
      startOffset: position,
      endOffset: suffixStart,
      score: Number(prefixMatches) + Number(suffixMatches),
      distance: Math.abs(position - annotation.startOffset),
    });
    position = text.indexOf(selectedText, position + 1);
  }

  const best = candidates.sort(
    (left, right) => right.score - left.score || left.distance - right.distance,
  )[0];
  if (!best) {
    return null;
  }
  return { startOffset: best.startOffset, endOffset: best.endOffset };
}
