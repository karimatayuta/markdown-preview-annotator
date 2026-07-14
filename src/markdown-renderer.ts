import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<rect x="5.75" y="1.75" width="8.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<path d="M10.25 14.25h-7a1.5 1.5 0 0 1-1.5-1.5v-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>';

markdown.core.ruler.after('block', 'source-line-metadata', (state) => {
  for (const token of state.tokens) {
    if (token.nesting === 1 && token.map) {
      token.attrSet('data-source-line-start', String(token.map[0] + 1));
      token.attrSet('data-source-line-end', String(token.map[1]));
    }
  }
});

markdown.core.ruler.after('inline', 'task-list-items', (state) => {
  let listItemDepth = 0;
  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index];
    if (!token) {
      continue;
    }
    if (token.type === 'list_item_open') {
      listItemDepth += 1;
      continue;
    }
    if (token.type === 'list_item_close') {
      listItemDepth -= 1;
      continue;
    }
    if (listItemDepth === 0 || token.type !== 'inline' || !token.children?.length) {
      continue;
    }

    const textToken = token.children.find((child) => child.type === 'text');
    const match = textToken?.content.match(/^\[([ xX])\]\s+/);
    if (!textToken || !match) {
      continue;
    }

    textToken.content = textToken.content.slice(match[0].length);
    const checkbox = new state.Token('html_inline', '', 0);
    const checked = match[1]?.toLowerCase() === 'x' ? ' checked' : '';
    checkbox.content = `<input class="task-list-item-checkbox"${checked} disabled type="checkbox">`;
    token.children.unshift(checkbox);

    for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
      if (state.tokens[parentIndex]?.type === 'list_item_open') {
        state.tokens[parentIndex]?.attrJoin('class', 'task-list-item');
        break;
      }
    }
  }
});

function sourceLineAttrs(token: { map: [number, number] | null }): string {
  if (!token.map) {
    return '';
  }
  return ` data-source-line-start="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"`;
}

function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
  return markdown.utils.escapeHtml(code);
}

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  if (!token) {
    return '';
  }
  const language = (token.info || '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const lineAttrs = sourceLineAttrs(token);

  if (language === 'mermaid') {
    return (
      `<figure class="mermaid-figure"${lineAttrs}>` +
      `<pre class="mermaid-source">${markdown.utils.escapeHtml(token.content)}</pre>` +
      '</figure>\n'
    );
  }

  const label = markdown.utils.escapeHtml(language || 'text');
  const codeClass = language
    ? `hljs language-${markdown.utils.escapeHtml(language)}`
    : 'hljs';
  return (
    `<figure class="code-figure"${lineAttrs} data-code-lang="${label}">` +
    `<button class="code-copy" type="button" title="コードをコピー" aria-label="コードをコピー">${COPY_ICON}</button>` +
    `<pre><code class="${codeClass}">${highlightCode(token.content, language)}</code></pre>` +
    '</figure>\n'
  );
};

markdown.renderer.rules.table_open = (tokens, index, options, _env, self) =>
  `<div class="table-wrap">${self.renderToken(tokens, index, options)}`;

markdown.renderer.rules.table_close = (tokens, index, options, _env, self) =>
  `${self.renderToken(tokens, index, options)}</div>`;

export function renderMarkdown(source: string): string {
  return markdown.render(String(source));
}
