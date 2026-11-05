// HomePage texts (U7, context.md and PO #15): every section shows the texts of content/hut.js, and the
// points of interest are a list with the walking time; with no points the card says "coming soon".
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import { hut } from '../../../src/content/hut.js';
import HomePage from '../../../src/pages/public/HomePage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

const region = (name) => screen.getByRole('region', { name });

describe('HomePage texts', () => {
  const points = hut.pointsOfInterest;

  beforeEach(() => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });
  afterEach(() => {
    hut.pointsOfInterest = points;
  });

  it('shows the hut texts, without placeholders', () => {
    renderPage(<HomePage />, { path: '/' });
    expect(screen.getByText(hut.tagline)).toBeInTheDocument();
    expect(region('About the hut')).toHaveTextContent(hut.description);
    expect(region('Location')).toHaveTextContent(hut.location);
    expect(region('How to get there')).toHaveTextContent(hut.gettingThere);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('lists each point of interest with its walking time', () => {
    renderPage(<HomePage />, { path: '/' });
    const items = within(region('Points of interest')).getAllByRole('listitem');
    expect(points.length).toBeGreaterThan(0);
    expect(items.map((li) => li.textContent)).toEqual(
      points.map((p) => `${p.name} – ${p.description} (${p.walkingTimeMin} min walk)`),
    );
  });

  it('says "coming soon" when there are no points of interest', () => {
    hut.pointsOfInterest = [];
    renderPage(<HomePage />, { path: '/' });
    expect(within(region('Points of interest')).queryByRole('list')).not.toBeInTheDocument();
    expect(region('Points of interest')).toHaveTextContent('Points of interest – coming soon.');
  });
});
