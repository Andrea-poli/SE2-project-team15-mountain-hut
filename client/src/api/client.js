// Shared HTTP client: every call to the server goes through apiFetch.
// Paths are relative (/api/...): in development Vite proxies them to the server,
// so the session cookie is same-origin and no CORS is needed.

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const NETWORK_ERROR = 'Cannot reach the server.';

// Mock mode (VITE_USE_MOCKS=true in .env): the api/* modules answer without a server.
export const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

// status 0 = the server could not be reached.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Returns the parsed JSON body, or null for 204 / empty body. Throws ApiError otherwise.
export async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options;
  const init = { credentials: 'same-origin', ...rest, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  // Read the body once as text: it may be empty, or not JSON (e.g. a proxy error page).
  let text = '';
  try {
    text = await res.text();
  } catch {
    // body lost: treated as empty
  }
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
      // Development only (removed from the build): helps spot a proxy error page or a server crash.
      if (import.meta.env.DEV) console.warn('Unreadable response from', path, text);
    }
  }

  if (!res.ok) {
    const message = typeof data?.error === 'string' && data.error ? data.error : GENERIC_ERROR;
    throw new ApiError(res.status, message);
  }
  if (data === undefined) throw new ApiError(res.status, GENERIC_ERROR);
  return res.status === 204 ? null : data;
}
