// =============================================================================
// Volumetrica HTTP Client
// =============================================================================
// Low-level wrapper around the Volumetrica Propfirm API V2.
// Handles base URL, x-api-key auth, retries, error mapping, and logging.
// =============================================================================

import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { PlatformError, ServiceUnavailableError } from '../../utils/errors.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;

interface VolumetricaRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown> | undefined;
  query?: Record<string, string | number | boolean | undefined> | undefined;
}

interface VolumetricaErrorBody {
  message?: string;
  error?: string;
  statusCode?: number;
  success?: boolean;
}

/** All Volumetrica API responses are wrapped in this envelope. */
interface VolumetricaEnvelope<T> {
  success: boolean;
  data: T;
}

/** Paginated responses include a nextPageToken alongside the envelope. */
interface VolumetricaPagedEnvelope<T> extends VolumetricaEnvelope<T> {
  nextPageToken?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class VolumetricaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    if (!config.volumetrica.apiUrl) {
      throw new PlatformError('VOLUMETRICA_API_URL is not configured');
    }
    if (!config.volumetrica.apiKey) {
      throw new PlatformError('VOLUMETRICA_API_KEY is not configured');
    }
    this.baseUrl = config.volumetrica.apiUrl.replace(/\/+$/, '');
    this.apiKey = config.volumetrica.apiKey;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async get<T = unknown>(
    path: string,
    query?: VolumetricaRequestOptions['query'],
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

  /** GET with pagination — returns { data, nextPageToken } without losing the token. */
  async getPaged<T = unknown>(
    path: string,
    query?: VolumetricaRequestOptions['query'],
  ): Promise<{ data: T; nextPageToken?: string | undefined }> {
    return this.requestPaged<T>({ method: 'GET', path, query });
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async request<T>(opts: VolumetricaRequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.doFetch(url, opts);

        if (res.ok) {
          if (res.status === 204) return undefined as T;
          const json = await res.json() as VolumetricaEnvelope<T> | T;

          // Unwrap the { success, data } envelope if present
          if (
            json !== null &&
            typeof json === 'object' &&
            'success' in json &&
            'data' in json
          ) {
            const envelope = json as VolumetricaEnvelope<T>;
            if (!envelope.success) {
              throw new PlatformError('Volumetrica returned success=false', {
                platformPath: opts.path,
              });
            }
            return envelope.data;
          }

          return json as T;
        }

        const errorBody = await this.safeParseJson<VolumetricaErrorBody>(res);

        if (res.status >= 500 && attempt < MAX_RETRIES) {
          logger.warn(
            { status: res.status, attempt, path: opts.path },
            'Volumetrica server error — retrying',
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
            'Volumetrica request failed — retrying',
          );
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        throw new ServiceUnavailableError(
          `Volumetrica API unreachable: ${(error as Error).message}`,
        );
      }
    }

    throw new ServiceUnavailableError('Volumetrica API: max retries exceeded');
  }

  /**
   * Like request(), but preserves `nextPageToken` from the paginated envelope.
   * Returns `{ data: T, nextPageToken?: string }`.
   */
  private async requestPaged<T>(
    opts: VolumetricaRequestOptions,
  ): Promise<{ data: T; nextPageToken?: string | undefined }> {
    const url = this.buildUrl(opts.path, opts.query);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.doFetch(url, opts);

        if (res.ok) {
          if (res.status === 204) return { data: undefined as T };
          const json = (await res.json()) as VolumetricaPagedEnvelope<T>;

          if (
            json !== null &&
            typeof json === 'object' &&
            'success' in json &&
            'data' in json
          ) {
            if (!json.success) {
              throw new PlatformError('Volumetrica returned success=false', {
                platformPath: opts.path,
              });
            }
            return {
              data: json.data,
              nextPageToken: json.nextPageToken ?? undefined,
            };
          }

          return { data: json as unknown as T };
        }

        const errorBody = await this.safeParseJson<VolumetricaErrorBody>(res);

        if (res.status >= 500 && attempt < MAX_RETRIES) {
          logger.warn(
            { status: res.status, attempt, path: opts.path },
            'Volumetrica server error — retrying',
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
            'Volumetrica request failed — retrying',
          );
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        throw new ServiceUnavailableError(
          `Volumetrica API unreachable: ${(error as Error).message}`,
        );
      }
    }

    throw new ServiceUnavailableError('Volumetrica API: max retries exceeded');
  }

  private async doFetch(
    url: string,
    opts: VolumetricaRequestOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Accept': 'application/json',
    };

    if (opts.body) {
      headers['Content-Type'] = 'application/json';
    }

    logger.debug(
      { method: opts.method, url: url.replace(this.apiKey, '***') },
      'Volumetrica request',
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
    query?: VolumetricaRequestOptions['query'],
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
    body: VolumetricaErrorBody | null,
    opts: VolumetricaRequestOptions,
  ): PlatformError {
    const msg =
      body?.message ?? body?.error ?? `Volumetrica API returned ${status}`;

    logger.error(
      { status, body, method: opts.method, path: opts.path },
      `Volumetrica API error: ${msg}`,
    );

    const mappedStatus =
      status === 404 ? 404 :
      status === 401 || status === 403 ? 502 :
      status >= 400 && status < 500 ? 400 :
      502;

    return new PlatformError(msg, {
      platformStatus: status,
      platformPath: opts.path,
      platformMethod: opts.method,
    }, mappedStatus);
  }
}
