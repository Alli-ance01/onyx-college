import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppProviders } from './providers/app-providers.js';
import { appRoutes } from './router/routes.js';

describe('application foundation', () => {
  it('boots the router and renders an accessible application shell', async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(
      await screen.findByRole('heading', { name: 'A clearer way to move through school life.' }),
    ).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('One secure home');
  });
});
