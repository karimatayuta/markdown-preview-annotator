import { resolveAnchor } from './anchor';
import { renderModernMermaid } from './beautiful-mermaid';
import type {
  Annotation,
  FontFamily,
  HostToWebviewMessage,
  LineHeight,
  Prefs,
  WebviewToHostMessage,
} from '../types';

interface WebviewState {
  annotations: Annotation[];
  prefs: Prefs;
}

interface VsCodeWebviewApi {
  getState(): WebviewState | undefined;
  setState(state: WebviewState): void;
  postMessage(message: WebviewToHostMessage): void;
}

interface BootData {
  documentTitle?: string;
  filePath?: string;
  initialAnnotations?: Annotation[];
  prefs?: Partial<Prefs>;
}

export type WebviewWindow = Window &
  typeof globalThis & {
    acquireVsCodeApi: () => VsCodeWebviewApi;
  };

const FONT_STACKS: Record<FontFamily, string> = {
  theme: 'var(--vscode-font-family)',
  sans: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Segoe UI", sans-serif',
  serif: '"Hiragino Mincho ProN", "Noto Serif JP", "Yu Mincho", Georgia, serif',
  mono: 'var(--vscode-editor-font-family, monospace)',
};
const LINE_HEIGHT_VALUES: Record<LineHeight, string> = {
  compact: '1.5',
  normal: '1.7',
  relaxed: '1.95',
};
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

export function initializeWebview(win: WebviewWindow): void {
  const doc = win.document;
  const vscode = win.acquireVsCodeApi();
  const bootData = JSON.parse(
    doc.querySelector('#boot-data')?.textContent ?? '{}',
  ) as BootData;
  const savedState = vscode.getState();
  let annotations: Annotation[] = savedState?.annotations ?? bootData.initialAnnotations ?? [];
  let prefs: Prefs = {
    fontSize: 14,
    fontFamily: 'theme',
    lineHeight: 'normal',
    contentWidth: 'full',
    ...bootData.prefs,
    ...savedState?.prefs,
  };
  let pendingSelection: Omit<Annotation, 'id' | 'comment'> | null = null;
  let selectionRect: DOMRect | null = null;
  let editingId: string | null = null;

  annotations.forEach((annotation, index) => {
    if (!annotation.id) {
      annotation.id = `legacy-${index}-${annotation.startOffset ?? 0}`;
    }
  });

  const preview = doc.querySelector<HTMLElement>('#preview')!;
  const previewPane = doc.querySelector<HTMLElement>('.preview-pane');
  const composer = doc.querySelector<HTMLFormElement>('#composer')!;
  const composerQuote = doc.querySelector<HTMLElement>('#composer-quote');
  const commentInput = doc.querySelector<HTMLTextAreaElement>('#comment-input')!;
  const annotationList = doc.querySelector<HTMLOListElement>('#annotation-list')!;
  const annotationCount = doc.querySelector<HTMLElement>('#annotation-count')!;
  const emptyState = doc.querySelector<HTMLElement>('#empty-state')!;
  const copyButton = doc.querySelector<HTMLButtonElement>('#copy-all')!;
  const clearButton = doc.querySelector<HTMLButtonElement>('#clear-all')!;
  const toast = doc.querySelector<HTMLElement>('#toast')!;
  const bubble = doc.querySelector<HTMLButtonElement>('#selection-bubble');
  const displayToggle = doc.querySelector<HTMLButtonElement>('#display-toggle');
  const displayPanel = doc.querySelector<HTMLElement>('#display-settings');
  const fontDecrease = doc.querySelector<HTMLButtonElement>('#font-decrease');
  const fontIncrease = doc.querySelector<HTMLButtonElement>('#font-increase');
  const fontSizeValue = doc.querySelector<HTMLElement>('#font-size-value');
  const fontFamilySelect = doc.querySelector<HTMLSelectElement>('#font-family-select');
  const lineHeightSelect = doc.querySelector<HTMLSelectElement>('#line-height-select');
  const contentWidthSelect = doc.querySelector<HTMLSelectElement>('#content-width-select');

  // ---- 表示設定 -------------------------------------------------------

  function applyPrefs(): void {
    const rootStyle = doc.documentElement.style;
    rootStyle.setProperty('--mpa-font-size', `${prefs.fontSize}px`);
    rootStyle.setProperty('--mpa-font-family', FONT_STACKS[prefs.fontFamily] ?? FONT_STACKS.theme);
    rootStyle.setProperty(
      '--mpa-line-height',
      LINE_HEIGHT_VALUES[prefs.lineHeight] ?? LINE_HEIGHT_VALUES.normal,
    );
    doc.body.classList.toggle('width-readable', prefs.contentWidth === 'readable');
    doc.body.classList.toggle('width-full', prefs.contentWidth !== 'readable');
    if (fontSizeValue) {
      fontSizeValue.textContent = `${prefs.fontSize}px`;
    }
    if (fontFamilySelect) {
      fontFamilySelect.value = prefs.fontFamily;
    }
    if (lineHeightSelect) {
      lineHeightSelect.value = prefs.lineHeight;
    }
    if (contentWidthSelect) {
      contentWidthSelect.value = prefs.contentWidth;
    }
  }

  function saveState(): void {
    vscode.setState({ annotations, prefs });
  }

  function updatePrefs(patch: Partial<Prefs>): void {
    prefs = { ...prefs, ...patch };
    applyPrefs();
    saveState();
    vscode.postMessage({ type: 'updatePrefs', prefs });
  }

  function setDisplayPanelOpen(open: boolean): void {
    if (!displayPanel || !displayToggle) {
      return;
    }
    displayPanel.classList.toggle('hidden', !open);
    displayToggle.setAttribute('aria-expanded', String(open));
  }

  displayToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    setDisplayPanelOpen(displayPanel?.classList.contains('hidden') ?? false);
  });
  displayPanel?.addEventListener('click', (event) => event.stopPropagation());
  fontDecrease?.addEventListener('click', () => {
    updatePrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 1) });
  });
  fontIncrease?.addEventListener('click', () => {
    updatePrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 1) });
  });
  fontFamilySelect?.addEventListener('change', () => {
    updatePrefs({ fontFamily: fontFamilySelect.value as FontFamily });
  });
  lineHeightSelect?.addEventListener('change', () => {
    updatePrefs({ lineHeight: lineHeightSelect.value as LineHeight });
  });
  contentWidthSelect?.addEventListener('change', () => {
    updatePrefs({ contentWidth: contentWidthSelect.value === 'readable' ? 'readable' : 'full' });
  });

  // ---- 本文テキストとアンカー -----------------------------------------

  function textNodes(): Text[] {
    const nodes: Text[] = [];
    const walker = doc.createTreeWalker(preview, win.NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest('.mermaid-render, .code-copy')
          ? win.NodeFilter.FILTER_REJECT
          : win.NodeFilter.FILTER_ACCEPT,
    });
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      node = walker.nextNode();
    }
    return nodes;
  }

  function previewText(): string {
    return textNodes()
      .map((node) => node.nodeValue ?? '')
      .join('');
  }

  function boundaryOffset(container: Node, offset: number): number {
    let total = 0;
    for (const node of textNodes()) {
      if (node === container) {
        return total + offset;
      }
      if (container.nodeType === win.Node.ELEMENT_NODE && container.contains(node)) {
        const child = container.childNodes[offset];
        if (!child || child === node || child.contains?.(node)) {
          return total;
        }
      }
      total += node.nodeValue?.length ?? 0;
    }
    return total;
  }

  function rangeFromOffsets(startOffset: number, endOffset: number): Range {
    const range = doc.createRange();
    const nodes = textNodes();
    let cursor = 0;
    let startSet = false;

    for (const node of nodes) {
      const nextCursor = cursor + (node.nodeValue?.length ?? 0);
      if (!startSet && startOffset <= nextCursor) {
        range.setStart(node, Math.max(0, startOffset - cursor));
        startSet = true;
      }
      if (startSet && endOffset <= nextCursor) {
        range.setEnd(node, Math.max(0, endOffset - cursor));
        return range;
      }
      cursor = nextCursor;
    }

    const lastNode = nodes.at(-1);
    if (!lastNode) {
      range.selectNodeContents(preview);
      range.collapse(true);
      return range;
    }

    const lastOffset = lastNode.nodeValue?.length ?? 0;
    if (!startSet) {
      range.setStart(lastNode, lastOffset);
    }
    range.setEnd(lastNode, lastOffset);
    return range;
  }

  function sourceElement(node: Node): HTMLElement | null {
    const element =
      node.nodeType === win.Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return element?.closest<HTMLElement>('[data-source-line-start]') ?? null;
  }

  function sourceLines(range: Range): { startLine: number; endLine: number } {
    const start = sourceElement(range.startContainer);
    const end = sourceElement(range.endContainer);
    return {
      startLine: Number(start?.dataset['sourceLineStart'] ?? 1),
      endLine: Number(end?.dataset['sourceLineEnd'] ?? start?.dataset['sourceLineEnd'] ?? 1),
    };
  }

  function resolveRange(annotation: Annotation): Range | null {
    const resolved = resolveAnchor(previewText(), annotation);
    if (!resolved) {
      return null;
    }
    annotation.startOffset = resolved.startOffset;
    annotation.endOffset = resolved.endOffset;
    const range = rangeFromOffsets(resolved.startOffset, resolved.endOffset);
    Object.assign(annotation, sourceLines(range));
    return range;
  }

  function lineLabel(annotation: Annotation): string {
    if (annotation.startLine === annotation.endLine) {
      return `line ${annotation.startLine}`;
    }
    return `lines ${annotation.startLine}-${annotation.endLine}`;
  }

  function markSourceElement(range: Range, number: number): void {
    const element = sourceElement(range.startContainer);
    if (!element) {
      return;
    }
    const current = element.dataset['annotationNumbers'];
    element.dataset['annotationNumbers'] = current ? `${current}, ${number}` : String(number);
    element.classList.add('has-annotation');
  }

  // ---- ハイライト ------------------------------------------------------

  function setHighlight(name: string, ranges: Range[]): void {
    const cssApi = win.CSS as typeof CSS | undefined;
    const HighlightCtor = (win as unknown as { Highlight?: new (...ranges: Range[]) => Highlight })
      .Highlight;
    if (cssApi?.highlights && HighlightCtor) {
      cssApi.highlights.set(name, new HighlightCtor(...ranges));
    }
  }

  function setActiveHighlight(annotation: Annotation): Range | null {
    const range = resolveRange(annotation);
    if (range) {
      setHighlight('annotation-active', [range]);
    }
    return range;
  }

  function clearActiveHighlight(): void {
    (win.CSS as typeof CSS | undefined)?.highlights?.delete?.('annotation-active');
  }

  let flashTimer: number | undefined;
  function scrollToAnnotation(annotation: Annotation): void {
    const range = setActiveHighlight(annotation);
    if (!range) {
      return;
    }
    sourceElement(range.startContainer)?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
    });
    win.clearTimeout(flashTimer);
    flashTimer = win.setTimeout(clearActiveHighlight, 1600);
  }

  // ---- トースト --------------------------------------------------------

  let toastTimer: number | undefined;
  function showToast(message: string): void {
    toast.textContent = message;
    toast.classList.add('visible');
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  // ---- コメント一覧 ----------------------------------------------------

  function persistAnnotations(): void {
    saveState();
    vscode.postMessage({ type: 'persist', annotations });
  }

  function buildCardActions(
    annotation: Annotation,
    index: number,
    range: Range | null,
  ): HTMLElement {
    const actions = doc.createElement('div');
    actions.className = 'annotation-card-actions';

    const revealButton = doc.createElement('button');
    revealButton.type = 'button';
    revealButton.className = 'secondary compact';
    revealButton.textContent = '元の行へ';
    revealButton.disabled = !range;
    revealButton.addEventListener('click', () => {
      vscode.postMessage({
        type: 'reveal',
        startLine: annotation.startLine,
        endLine: annotation.endLine,
      });
    });

    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'secondary compact';
    editButton.textContent = '編集';
    editButton.addEventListener('click', () => {
      editingId = annotation.id;
      renderAnnotations();
    });

    const deleteButton = doc.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger compact';
    deleteButton.textContent = '削除';
    deleteButton.addEventListener('click', () => {
      clearActiveHighlight();
      annotations.splice(index, 1);
      persistAnnotations();
      renderAnnotations();
      showToast('コメントを削除しました。');
    });

    actions.append(revealButton, editButton, deleteButton);
    return actions;
  }

  function buildCardEditor(annotation: Annotation): {
    editor: HTMLTextAreaElement;
    actions: HTMLElement;
  } {
    const editor = doc.createElement('textarea');
    editor.className = 'annotation-edit';
    editor.rows = 3;
    editor.value = annotation.comment;

    const actions = doc.createElement('div');
    actions.className = 'annotation-card-actions';

    const saveButton = doc.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'compact';
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', () => {
      const comment = editor.value.trim();
      if (comment) {
        annotation.comment = comment;
        persistAnnotations();
        showToast('コメントを更新しました。');
      }
      editingId = null;
      renderAnnotations();
    });

    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary compact';
    cancelButton.textContent = 'キャンセル';
    cancelButton.addEventListener('click', () => {
      editingId = null;
      renderAnnotations();
    });

    actions.append(saveButton, cancelButton);
    return { editor, actions };
  }

  function renderAnnotations(): void {
    annotationList.replaceChildren();
    preview.querySelectorAll('.has-annotation').forEach((element) => {
      element.classList.remove('has-annotation');
      delete (element as HTMLElement).dataset['annotationNumbers'];
    });

    const highlightRanges: Range[] = [];
    annotations.forEach((annotation, index) => {
      const range = resolveRange(annotation);
      if (range) {
        highlightRanges.push(range);
        markSourceElement(range, index + 1);
      }

      const item = doc.createElement('li');
      item.className = range ? 'annotation-card' : 'annotation-card orphaned';

      const heading = doc.createElement('div');
      heading.className = 'annotation-card-heading';
      const badge = doc.createElement('span');
      badge.className = 'annotation-badge';
      badge.textContent = String(index + 1);
      const lines = doc.createElement('span');
      lines.className = 'annotation-lines';
      lines.textContent = range ? lineLabel(annotation) : '位置不明';
      heading.append(badge, lines);

      const selected = doc.createElement('blockquote');
      selected.textContent = annotation.selectedText;
      if (range) {
        selected.title = 'クリックで該当箇所へ移動';
        selected.classList.add('clickable');
        selected.addEventListener('click', () => scrollToAnnotation(annotation));
      }

      if (editingId != null && editingId === annotation.id) {
        const { editor, actions } = buildCardEditor(annotation);
        item.append(heading, selected, editor, actions);
      } else {
        const comment = doc.createElement('p');
        comment.textContent = annotation.comment;
        item.append(heading, selected, comment, buildCardActions(annotation, index, range));
      }

      if (range) {
        item.addEventListener('mouseenter', () => setActiveHighlight(annotation));
        item.addEventListener('mouseleave', clearActiveHighlight);
      }
      annotationList.append(item);
    });

    setHighlight('annotation-ranges', highlightRanges);

    annotationCount.textContent = String(annotations.length);
    emptyState.hidden = annotations.length > 0;
    copyButton.disabled = annotations.length === 0;
    clearButton.disabled = annotations.length === 0;
  }

  // ---- 選択バブルとコンポーザー ----------------------------------------

  function hideBubble(): void {
    bubble?.classList.add('hidden');
  }

  function hideComposer(): void {
    pendingSelection = null;
    selectionRect = null;
    composer.classList.add('hidden');
    commentInput.value = '';
  }

  function prepareSelection(range: Range): DOMRect | null {
    const rawText = range.toString();
    const selectedText = rawText.trim();
    if (!selectedText) {
      pendingSelection = null;
      return null;
    }

    const leadingWhitespace = rawText.length - rawText.trimStart().length;
    const trailingWhitespace = rawText.length - rawText.trimEnd().length;
    const startOffset = boundaryOffset(range.startContainer, range.startOffset) + leadingWhitespace;
    const endOffset = boundaryOffset(range.endContainer, range.endOffset) - trailingWhitespace;
    const normalizedRange = rangeFromOffsets(startOffset, endOffset);
    const fullText = previewText();
    pendingSelection = {
      selectedText,
      startOffset,
      endOffset,
      prefix: fullText.slice(Math.max(0, startOffset - 40), startOffset),
      suffix: fullText.slice(endOffset, endOffset + 40),
      ...sourceLines(normalizedRange),
    };
    return normalizedRange.getBoundingClientRect?.() ?? null;
  }

  function hasUsableRect(rect: DOMRect | null): rect is DOMRect {
    return Boolean(rect && (rect.width || rect.height || rect.left || rect.top));
  }

  function showBubble(rect: DOMRect | null, event?: MouseEvent): void {
    if (!bubble) {
      openComposer();
      return;
    }
    const left = hasUsableRect(rect) ? rect.left + rect.width / 2 : (event?.clientX ?? 24);
    const top = hasUsableRect(rect) ? rect.bottom + 10 : (event?.clientY ?? 16) + 12;
    bubble.style.left = `${Math.max(12, Math.min(left, win.innerWidth - 130))}px`;
    bubble.style.top = `${Math.max(12, Math.min(top, win.innerHeight - 48))}px`;
    bubble.classList.remove('hidden');
  }

  function openComposer(): void {
    if (!pendingSelection) {
      return;
    }
    hideBubble();
    const rect = selectionRect;
    composer.style.left = `${Math.max(12, Math.min(rect?.left ?? 24, win.innerWidth - 380))}px`;
    composer.style.top = `${Math.max(12, (rect?.bottom ?? 24) + 8)}px`;
    composer.style.transform = 'none';
    if (composerQuote) {
      const quote = pendingSelection.selectedText;
      composerQuote.textContent = quote.length > 180 ? `${quote.slice(0, 180)}…` : quote;
    }
    composer.classList.remove('hidden');
    commentInput.focus();
  }

  function insideMermaidRender(node: Node): boolean {
    const element =
      node.nodeType === win.Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return Boolean(element?.closest?.('.mermaid-render'));
  }

  preview.addEventListener('mouseup', (event) => {
    const selection = win.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) {
      return;
    }
    if (insideMermaidRender(range.commonAncestorContainer)) {
      hideBubble();
      return;
    }
    const rect = prepareSelection(range.cloneRange());
    if (!pendingSelection) {
      hideBubble();
      return;
    }
    selectionRect = rect;
    showBubble(rect, event);
  });

  bubble?.addEventListener('mousedown', (event) => event.preventDefault());
  bubble?.addEventListener('click', () => {
    openComposer();
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const comment = commentInput.value.trim();
    if (!pendingSelection || !comment) {
      return;
    }
    annotations.push({
      id: win.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      ...pendingSelection,
      comment,
    });
    persistAnnotations();
    renderAnnotations();
    win.getSelection()?.removeAllRanges();
    hideComposer();
    showToast('コメントを追加しました。');
  });

  commentInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (typeof composer.requestSubmit === 'function') {
        composer.requestSubmit();
      } else {
        composer.dispatchEvent(new win.Event('submit', { cancelable: true }));
      }
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideBubble();
      hideComposer();
      setDisplayPanelOpen(false);
    }
  });

  doc.addEventListener('mousedown', (event) => {
    const target = event.target as Node;
    if (bubble && !bubble.contains(target)) {
      hideBubble();
    }
    if (displayPanel && !displayPanel.classList.contains('hidden')) {
      if (!displayPanel.contains(target) && target !== displayToggle) {
        setDisplayPanelOpen(false);
      }
    }
  });

  previewPane?.addEventListener('scroll', hideBubble);

  doc.querySelector('#cancel-comment')?.addEventListener('click', hideComposer);
  copyButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'copy', annotations });
  });
  clearButton.addEventListener('click', () => {
    clearActiveHighlight();
    annotations = [];
    persistAnnotations();
    renderAnnotations();
    showToast('すべてのコメントを削除しました。');
  });

  preview.addEventListener('click', (event) => {
    const target = event.target as Element;
    const copyCodeButton = target.closest?.('.code-copy');
    if (copyCodeButton) {
      const code = copyCodeButton.closest('.code-figure')?.querySelector('pre')?.textContent ?? '';
      vscode.postMessage({ type: 'copyCode', code });
      return;
    }
    const link = target.closest?.<HTMLAnchorElement>('a[href]');
    if (link) {
      event.preventDefault();
      vscode.postMessage({ type: 'openLink', href: link.href });
    }
  });

  // ---- Mermaid ---------------------------------------------------------

  let mermaidCounter = 0;

  function renderMermaidBlocks(): void {
    const figures = preview.querySelectorAll<HTMLElement>(
      '.mermaid-figure:not([data-mermaid-done])',
    );
    for (const figure of figures) {
      const source = figure.querySelector('.mermaid-source');
      if (!source) {
        continue;
      }
      figure.dataset['mermaidDone'] = 'true';
      try {
        mermaidCounter += 1;
        const svg = renderModernMermaid(
          source.textContent ?? '',
          `mpa-mermaid-${mermaidCounter}`,
        );
        const host = doc.createElement('div');
        host.className = 'mermaid-render';
        host.innerHTML = svg;
        figure.append(host);
        figure.classList.add('rendered');
      } catch {
        figure.classList.add('mermaid-error');
      }
    }
  }

  // ---- 拡張側からのメッセージ ------------------------------------------

  win.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
    const message = event.data;
    if (message.type === 'sourceUpdate') {
      preview.innerHTML = message.html;
      hideBubble();
      renderAnnotations();
      persistAnnotations();
      renderMermaidBlocks();
    }
    if (message.type === 'prefsUpdate' && message.prefs) {
      prefs = { ...prefs, ...message.prefs };
      applyPrefs();
      saveState();
    }
    if (message.type === 'copySucceeded' || message.type === 'copyFailed') {
      showToast(message.message);
    }
  });

  applyPrefs();
  renderMermaidBlocks();
  renderAnnotations();
}
