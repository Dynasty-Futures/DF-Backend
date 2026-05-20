// =============================================================================
// YPF (YourPropFirm) HTTP Client
// =============================================================================
// Low-level wrapper around YPF Client API v1.
// Handles base URL, X-Client-Key auth, retries, error mapping, and logging.
//
// Differences from VolumetricaClient:
//  - Auth header is `X-Client-Key` (not `x-api-key`)
//  - No `{success, data}` envelope — responses are direct JSON
//  - Errors follow RFC 7807 problem+json: `{type, title, status, traceId, errors?}`
// =============================================================================

import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { PlatformError, ServiceUnavailableError } from '../../utils/errors.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;

interface YPFRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown> | undefined;
  query?: Record<string, string | number | boolean | undefined> | undefined;
}

/** RFC 7807 problem+json shape returned by YPF on errors. */
interface YPFProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  traceId?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export class YPFClient {
  private readonly baseUrl: string;
  private readonly clientKey: string;

  constructor() {
    if (!config.ypf.apiUrl) {
      throw new PlatformError('YPF_API_URL is not configured');
    }
    if (!config.ypf.clientKey) {
      throw new PlatformError('YPF_CLIENT_KEY is not configured');
    }
    this.baseUrl = config.ypf.apiUrl.replace(/\/+$/, '');
    this.clientKey = config.ypf.clientKey;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async get<T = unknown>(
    path: string,
    query?: YPFRequestOptions['query'],
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, query });
  }

  async post<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>({ method: 'POST', path, body });
  }

  async put<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  async del<T = void>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', path });
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async request<T>(opts: YPFRequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.doFetch(url, opts);

        if (res.ok) {
          if (res.status === 204) return undefined as T;
          return (await res.json()) as T;
        }

        const errorBody = await this.safeParseJson<YPFProblemDetails>(res);

        if (res.status >= 500 && attempt < MAX_RETRIES) {
          logger.warn(
            { status: res.status, attempt, path: opts.path },
            'YPF server error — retrying',
          );
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        throw this.mapError(res.status, errorBody, opts);
      } catch (error) {
        if (error instanceof PlatformError) throw error;

        if (attempt < MAX_RETRIES) {
          logger.warn(
            { err: error, attempt, path: opts.path },
            'YPF request failed — retrying',
          );
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        throw new ServiceUnavailableError(
          `YPF API unreachable: ${(error as Error).message}`,
        );
      }
    }

    throw new ServiceUnavailableError('YPF API: max retries exceeded');
  }

  private async doFetch(
    url: string,
    opts: YPFRequestOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'X-Client-Key': this.clientKey,
      Accept: 'application/json',
    };

    if (opts.body) {
      headers['Content-Type'] = 'application/json';
    }

    logger.debug(
      { method: opts.method, path: opts.path },
      'YPF request',
    );

    const init: RequestInit = {
      method: opts.method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (opts.body) {
      init.body = JSON.stringify(opts.body);
    }

    return fetch(url, init);
  }

  private buildUrl(
    path: string,
    query?: YPFRequestOptions['query'],
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, val] of Object.entries(query)) {
        if (val !== undefined) {
          url.searchParams.set(key, String(val));
        }
      }
    }
    return url.toString();
  }

  private async safeParseJson<T>(res: Response): Promise<T | null> {
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private mapError(
    status: number,
    body: YPFProblemDetails | null,
    opts: YPFRequestOptions,
  ): PlatformError {
    const fieldErrors = body?.errors
      ? Object.entries(body.errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ')
      : null;

    const msg =
      body?.detail ??
      fieldErrors ??
      body?.title ??
      `YPF API returned ${status}`;

    logger.error(
      { status, body, method: opts.method, path: opts.path },
      `YPF API error: ${msg}`,
    );

    const mappedStatus =
      status === 404
        ? 404
        : status === 401 || status === 403
          ? 502
          : status >= 400 && status < 500
            ? 400
            : 502;

    return new PlatformError(
      msg,
      {
        platformStatus: status,
        platformPath: opts.path,
        platformMethod: opts.method,
        traceId: body?.traceId,
      },
      mappedStatus,
    );
  }
}
