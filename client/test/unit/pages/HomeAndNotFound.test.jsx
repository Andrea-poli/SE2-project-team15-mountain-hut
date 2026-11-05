import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import { hut } from '../../../src/content/hut.js';
import HomePage from '../../../src/pages/public/HomePage.jsx';
import NotFoundPage from '../../../src/pages/NotFoundPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

describe('HomePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('presents the hut with the sections asked by the PO (#15)', () => {
    renderPage(<HomePage />, { path: '/' });
    expect(screen.getByRole('heading', { level: 1, name: hut.name })).toBeInTheDocument();
    for (const title of ['About the hut', 'Location', 'How to get there', 'Points of interest']) {
      expect(screen.getByRole('region', { name: title }), title).toBeInTheDocument();
    }
  });

  it('leads to the availability check with a real link (it opens a page, so it is not a button)', async () => {
    renderPage(<HomePage />, { path: '/' });
    const link = screen.getByRole('link', { name: 'Check availability' });
    expect(link).toHaveAttribute('href', '/availability');
    await userEvent.click(link);
    expect(await screen.findByText('Landed on /availability')).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('says the address is not a page and links to the home page', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderPage(<NotFoundPage />, { path: '/nothing' });
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  it('links staff to the slots', async () => {
    vi.mocked(authApi.me).mockResolvedValue(employee);
    renderPage(<NotFoundPage />, { path: '/nothing' });
    expect(await screen.findByRole('link', { name: 'Go to slots' })).toHaveAttribute('href', '/staff/slots');
  });
});
