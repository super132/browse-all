// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'NAVIGATION_FAILED'
  | 'ELEMENT_NOT_FOUND'
  | 'TIMEOUT'
  | 'DOWNLOAD_FAILED'
  | 'UPLOAD_FAILED'
  | 'INVALID_ARGUMENTS';

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
}

// ---------------------------------------------------------------------------
// Interactive elements returned by the `read` command
// ---------------------------------------------------------------------------

export interface LinkElement {
  type: 'link';
  text: string;
  href: string;
  selector: string;
}

export interface ButtonElement {
  type: 'button';
  text: string;
  selector: string;
}

export interface InputElement {
  type: 'input';
  name: string;
  inputType: string;
  selector: string;
}

export type InteractiveElement = LinkElement | ButtonElement | InputElement;

// ---------------------------------------------------------------------------
// Command response types
// ---------------------------------------------------------------------------

export interface StartResponse {
  sessionId: string;
  message: 'Session started';
}

export interface NavigateResponse {
  sessionId: string;
  url: string;
  title: string;
}

export interface ReadResponse {
  sessionId: string;
  url: string;
  title: string;
  markdown: string;
  screenshotPath: string;
  interactiveElements: InteractiveElement[];
}

export interface ActionResponse {
  sessionId: string;
  action: 'click' | 'type' | 'scroll' | 'hover' | 'upload' | 'wait';
  target: string;
  // Additional fields populated depending on action
  text?: string;
  direction?: 'up' | 'down';
  amount?: number;
  file?: string;
}

export interface DownloadResponse {
  sessionId: string;
  action: 'download';
  filePath: string;
  fileName: string;
}

export interface CloseResponse {
  sessionId: string;
  message: 'Session closed';
}

// ---------------------------------------------------------------------------
// Daemon IPC types
// ---------------------------------------------------------------------------

export interface CommandRequest {
  command: string;
  sessionId?: string;
  args: Record<string, unknown>;
}

export type CommandResponse =
  | StartResponse
  | NavigateResponse
  | ReadResponse
  | ActionResponse
  | DownloadResponse
  | CloseResponse
  | ErrorResponse;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function isErrorResponse(response: CommandResponse): response is ErrorResponse {
  return 'code' in response && 'error' in response;
}
