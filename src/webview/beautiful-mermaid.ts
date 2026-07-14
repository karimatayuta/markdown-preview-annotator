import { renderMermaidSVG, type RenderOptions } from 'beautiful-mermaid';

const MODERN_THEME: RenderOptions = {
  bg: 'var(--vscode-editor-background)',
  fg: 'var(--vscode-editor-foreground)',
  line: 'var(--vscode-descriptionForeground)',
  accent: 'var(--vscode-textLink-foreground)',
  muted: 'var(--vscode-descriptionForeground)',
  surface: 'var(--vscode-editorWidget-background)',
  border: 'var(--vscode-panel-border)',
  transparent: true,
  padding: 32,
  nodeSpacing: 28,
  layerSpacing: 48,
  componentSpacing: 28,
};

function applyLocalFont(svg: string): string {
  return svg
    .replace(/^\s*@import url\([^\n]+\);\s*$/gm, '')
    .replace(
      /text \{ font-family: '[^']*', system-ui, sans-serif; \}/,
      'text { font-family: var(--mpa-font-family, var(--vscode-font-family)), system-ui, sans-serif; }',
    );
}

function namespaceSvgIds(svg: string, namespace: string): string {
  const prefix = namespace.replace(/[^A-Za-z0-9_-]/g, '-');
  const ids = new Map<string, string>();
  const withNamespacedIds = svg.replace(/\bid="([^"]+)"/g, (_match, id: string) => {
    const namespacedId = `${prefix}-${id}`;
    ids.set(id, namespacedId);
    return `id="${namespacedId}"`;
  });

  return withNamespacedIds
    .replace(/url\(#([^)]+)\)/g, (match, id: string) => {
      const namespacedId = ids.get(id);
      return namespacedId ? `url(#${namespacedId})` : match;
    })
    .replace(/\b((?:xlink:)?href)="#([^"]+)"/g, (match, attribute: string, id: string) => {
      const namespacedId = ids.get(id);
      return namespacedId ? `${attribute}="#${namespacedId}"` : match;
    });
}

export function renderModernMermaid(source: string, namespace?: string): string {
  if (!source.trim()) {
    throw new TypeError('Mermaid source is required');
  }

  const svg = applyLocalFont(renderMermaidSVG(source, MODERN_THEME));
  return namespace ? namespaceSvgIds(svg, namespace) : svg;
}
