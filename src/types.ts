export type FontFamily = 'theme' | 'sans' | 'serif' | 'mono';
export type LineHeight = 'compact' | 'normal' | 'relaxed';
export type ContentWidth = 'full' | 'readable';

export interface Prefs {
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
}

export interface Annotation {
  id: string;
  selectedText: string;
  comment: string;
  startOffset: number;
  endOffset: number;
  prefix: string;
  suffix: string;
  startLine: number;
  endLine: number;
}

export type AnnotationAnchorInput = Pick<
  Annotation,
  'selectedText' | 'startOffset' | 'endOffset' | 'prefix' | 'suffix'
>;

export type WebviewToHostMessage =
  | { type: 'persist'; annotations: Annotation[] }
  | { type: 'updatePrefs'; prefs: Prefs }
  | { type: 'copy'; annotations: Annotation[] }
  | { type: 'copyCode'; code: string }
  | { type: 'reveal'; startLine: number; endLine: number }
  | { type: 'openLink'; href: string };

export type HostToWebviewMessage =
  | { type: 'sourceUpdate'; html: string }
  | { type: 'prefsUpdate'; prefs: Prefs }
  | { type: 'copySucceeded'; message: string }
  | { type: 'copyFailed'; message: string };
