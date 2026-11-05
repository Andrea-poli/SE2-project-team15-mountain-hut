// HomePage with points of interest (U7): content/hut.js has none yet ("coming soon"), so this test
// replaces the texts to check the list that appears once the team fills them in.
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import HomePage from '../../../src/pages/public/HomePage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../../../src/content/hut.js', () => ({
  hut: {
    name: 'Rifugio Test',
    tagline: 'A hut for the tests',
    description: 'Description',
    location: 'Location',
    gettingThere: 'Getting there',
    pointsOfInterest: [
      { name: 'Lake', description: 'A small lake', walkingTimeMin: 20 },
      { name: 'Summit', description: 'The view', walkingTimeMin: 90 },
    ],
  },
}));

describe('HomePage points of interest', () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('lists each point of interest with its walking time', () => {
    renderPage(<HomePage />, { path: '/' });
    const items = within(screen.getByRole('region', { name: 'Points of interest' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Lake – A small lake (20 min walk)',
      'Summit – The view (90 min walk)',
    ]);
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
  });
});
