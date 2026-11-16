import { getServerEnv } from './env';
import { IPaginationMeta } from './types';

export class NestApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'NestApiError';
    this.status = status;
    this.details = details;
  }
}

interface INestEnvelope<T> {
  success?: boolean;
  message?: string | string[];
  data?: T;
  meta?: IPaginationMeta;
  error?: string;
  statusCode?: number;
}

export interface INestFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  nestToken?: string | null;
  guestSessionId?: string | null;
  headers?: Record<string, string>;
  cache?: RequestCache;
  /** Incoming browser request; its client IP is forwarded so the API can rate-limit per visitor */
  request?: Request;
}

/**
 * Real visitor IP as seen by this server. On Vercel/behind a proxy the platform sets
 * x-real-ip / x-forwarded-for; the left-most forwarded entry is the original client.
 */
export function getClientIp(request: Request): string | null {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || null;
}

export async function nestFetch<T>(
  path: string,
  options: INestFetchOptions = {},
): Promise<{ data: T; meta?: IPaginationMeta; message?: string }> {
  const { nestApiUrl } = getServerEnv();
  const url = `${nestApiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.nestToken) {
    headers.Authorization = `Bearer ${options.nestToken}`;
  }
  if (options.guestSessionId) {
    headers['x-guest-session-id'] = options.guestSessionId;
  }
  if (options.request) {
    const clientIp = getClientIp(options.request);
    if (clientIp) headers['x-forwarded-for'] = clientIp;
  }

  let payloadBody: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      payloadBody = options.body;
    } else {
      headers['Content-Type'] = 'application/json';
      payloadBody = JSON.stringify(options.body);
    }
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: payloadBody,
    cache: options.cache ?? 'no-store',
  });

  const text = await response.text();
  let parsed: INestEnvelope<T> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as INestEnvelope<T>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const rawMessage = parsed?.message ?? parsed?.error ?? text;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : String(rawMessage || `Upstream request failed (${response.status})`);
    throw new NestApiError(response.status, message, parsed);
  }

  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return {
      data: parsed.data as T,
      meta: parsed.meta,
      message: Array.isArray(parsed.message)
        ? parsed.message.join('; ')
        : parsed.message,
    };
  }

  return { data: parsed as unknown as T };
}

export function errorJsonResponse(error: unknown) {
  if (error instanceof NestApiError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
  const message =
    error instanceof Error ? error.message : 'Unexpected server error';
  return {
    status: 500,
    body: {
      success: false,
      error: message,
    },
  };
}
