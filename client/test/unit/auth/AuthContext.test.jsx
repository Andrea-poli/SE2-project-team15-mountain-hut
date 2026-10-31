import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import { AuthProvider } from '../../../src/auth/AuthContext.jsx';
import { useAuth } from '../../../src/auth/useAuth.js';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

// Shows the context values and calls its actions, catching the errors they throw back.
function Probe() {
  const { user, loading, error, login, register, logout } = useAuth();
  const run = (action) => () => action().catch(() => {});
  return (
    <>
      <p>loading: {String(loading)}</p>
      <p>user: {user ? user.firstName : 'none'}</p>
      <p>error: {error ?? 'none'}</p>
      <button onClick={run(() => login('hiker@example.com', 'hikerpass'))}>login</button>
      <button onClick={run(() => register({ firstName: 'Hannah' }))}>register</button>
      <button onClick={run(logout)}>logout</button>
    </>
  );
}

function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => vi.resetAllMocks());

  it('is loading until the startup check answers, then has the logged-in user', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderProvider();
    expect(screen.getByText('loading: true')).toBeInTheDocument();
    expect(await screen.findByText('user: Hannah')).toBeInTheDocument();
    expect(screen.getByText('loading: false')).toBeInTheDocument();
  });

  it('treats 401 at startup as "nobody logged in", not as an error', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderProvider();
    expect(await screen.findByText('loading: false')).toBeInTheDocument();
    expect(screen.getByText('user: none')).toBeInTheDocument();
    expect(screen.getByText('error: none')).toBeInTheDocument();
  });

  it('keeps any other startup failure as an error for the layout', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    renderProvider();
    expect(await screen.findByText('error: Cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByText('user: none')).toBeInTheDocument();
  });

  it('login sets the user and clears the startup error', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    vi.mocked(authApi.login).mockResolvedValue(hiker);
    renderProvider();
    await screen.findByText('error: Cannot reach the server.');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('user: Hannah')).toBeInTheDocument();
    expect(screen.getByText('error: none')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith('hiker@example.com', 'hikerpass');
  });

  it('a failed login leaves nobody logged in (the form shows the error, not the context)', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    renderProvider();
    await screen.findByText('loading: false');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(authApi.login).toHaveBeenCalled());
    expect(screen.getByText('user: none')).toBeInTheDocument();
    expect(screen.getByText('error: none')).toBeInTheDocument();
  });

  it('register logs the new hiker in', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderProvider();
    await screen.findByText('loading: false');
    await userEvent.click(screen.getByRole('button', { name: 'register' }));
    expect(await screen.findByText('user: Hannah')).toBeInTheDocument();
  });

  it('logout clears the user', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    vi.mocked(authApi.logout).mockResolvedValue(null);
    renderProvider();
    await screen.findByText('user: Hannah');
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('user: none')).toBeInTheDocument();
  });

  it('a failed logout keeps the user and shows the error', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    renderProvider();
    await screen.findByText('user: Hannah');
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('error: Cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByText('user: Hannah')).toBeInTheDocument();
  });

  it('useAuth outside the provider fails with a clear message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>');
    vi.mocked(console.error).mockRestore();
  });
});
