import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client.js';
import App from '../../src/App.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';

// No server in unit tests: nobody is logged in.
vi.mock('../../src/api/auth.js', () => ({
  me: vi.fn(() => Promise.reject(new ApiError(401, 'Not logged in'))),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

describe('App', () => {
  it('shows the page title as the only h1', async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Mountain Hut' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
