// MH-09 FT1 – api/slots.js copyWeek(): POST /api/slots/copy-week through apiFetch, or the mock when
// VITE_USE_MOCKS=true (the mock itself is not tested: it will be removed). useMocks is read when the module loads,
// so every test loads it again with vi.resetModules.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  return import('../../../src/api/slots.js');
}

const reply = (status, data) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('../../../src/api/mocks/slots.js');
});

describe('copyWeek', () => {
  it('POST /api/slots/copy-week with { sourceWeek, targetWeek }, answering the CopyWeekResult', async () => {
    const answer = { created: [], replaced: [], skipped: [] };
    const fetch = vi.fn().mockResolvedValue(reply(201, answer));
    vi.stubGlobal('fetch', fetch);
    const { copyWeek } = await load(false);

    await expect(copyWeek('2026-11-02', '2026-11-09')).resolves.toEqual(answer);
    expect(fetch).toHaveBeenCalledWith(
      '/api/slots/copy-week',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceWeek: '2026-11-02', targetWeek: '2026-11-09' }) }),
    );
  });

  it('a 409 is thrown as an ApiError with the server message', async () => {
    const message = 'The target week has bookings: its schedule cannot be replaced';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { error: message })));
    const { copyWeek } = await load(false);

    await expect(copyWeek('2026-11-02', '2026-11-09')).rejects.toMatchObject({ status: 409, message });
  });

  it('with VITE_USE_MOCKS=true it answers from the mock, without any request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.doMock('../../../src/api/mocks/slots.js', () => ({
      copyWeek: vi.fn(async (sourceWeek, targetWeek) => ({ mock: 'copy', sourceWeek, targetWeek })),
    }));
    const { copyWeek } = await load(true);

    await expect(copyWeek('2026-11-02', '2026-11-09')).resolves.toEqual({ mock: 'copy', sourceWeek: '2026-11-02', targetWeek: '2026-11-09' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
