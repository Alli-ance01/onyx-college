import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AuthenticatedPrincipal } from '@onyx/contracts';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../../lib/api/api-client.js';
import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../lib/auth/auth-session-context.js';
import { PortalLayout } from './portal-layout.js';

const principal: AuthenticatedPrincipal = {
  accountStatus: 'ACTIVE',
  accountType: 'ADMINISTRATOR',
  displayName: 'Ada Admin',
  mustChangePassword: false,
  permissions: ['students.read', 'students.approve_registration', 'audit.read'],
  portal: 'ADMIN',
  roles: ['SCHOOL_ADMIN'],
  sessionId: 'session-id',
  userId: 'user-id',
  username: 'ada.admin',
};

function renderAdminShell() {
  const context: AuthSessionContextValue = {
    apiClient: new ApiClient({ baseUrl: 'http://localhost' }),
    changePassword: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    principal,
    refreshSession: vi.fn().mockResolvedValue(true),
    status: 'authenticated',
  };

  render(
    <AuthSessionContext.Provider value={context}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<PortalLayout portalName="Admin Portal" />} path="/admin">
            <Route index element={<p>Admin workspace</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthSessionContext.Provider>,
  );
}

afterEach(cleanup);

describe('PortalLayout', () => {
  it('shows only permitted administration links and exposes an accessible mobile menu', () => {
    renderAdminShell();

    const navigation = screen.getByRole('navigation', { name: 'Admin Portal navigation' });
    expect(within(navigation).getByRole('link', { name: 'All students' })).toBeVisible();
    expect(within(navigation).getByRole('link', { name: 'Audit logs' })).toBeVisible();
    expect(within(navigation).queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument();

    const menuButton = screen.getByRole('button', { name: 'Open navigation' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  });
  it('searches permitted pages, including contextual views, without revealing restricted destinations', () => {
    renderAdminShell();
    const search = screen.getByRole('textbox', { name: 'Find a page' });
    const navigation = screen.getByRole('navigation', { name: 'Admin Portal navigation' });
    fireEvent.change(search, { target: { value: 'archived' } });
    expect(within(navigation).getByRole('link', { name: 'Archived' })).toHaveAttribute(
      'href',
      '/admin/students/archived',
    );
    expect(within(navigation).queryByRole('link', { name: 'Audit logs' })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'roles' } });
    expect(within(navigation).queryByRole('link')).not.toBeInTheDocument();
    expect(within(navigation).getByRole('status')).toHaveTextContent('No pages found');
    fireEvent.change(search, { target: { value: '' } });
    expect(within(navigation).getByRole('link', { name: 'All students' })).toBeVisible();
  });
});
