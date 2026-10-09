import { ConnectionStatus } from '../../shared/ui/connection-status.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { SignOutButton } from '../../features/auth/sign-out-button.js';

import { Brand } from '../../shared/ui/brand.js';
import { Icon, type IconName } from '../../shared/ui/icon.js';

import { navigationFor, type PortalName } from './portal-navigation.js';

interface PortalLayoutProps {
  portalName: PortalName;
}

function navigationIcon(path: string): IconName {
  if (path === '/admin' || path === '/teacher' || path.includes('dashboard')) return 'home';
  if (/notification|announcement/.test(path)) return 'bell';
  if (/result|grading|assessment/.test(path)) return 'chart';
  if (/\/(students|teachers|administrators)(\/|$)|profile/.test(path)) return 'people';
  if (/session|term|calendar/.test(path)) return 'calendar';
  if (/subject|class|academic/.test(path)) return 'book';
  if (/role|permission|audit/.test(path)) return 'shield';
  if (path.includes('setting')) return 'settings';
  return 'document';
}

function initials(displayName: string | undefined): string {
  if (displayName === undefined || displayName.trim() === '') return 'OC';

  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function PortalLayout({ portalName }: PortalLayoutProps) {
  const auth = useAuthSession();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const sidebar = useRef<HTMLElement>(null);
  const permittedNavigation = useMemo(() => {
    const effectivePermissions = new Set(auth.principal?.permissions ?? []);

    return navigationFor(portalName)
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.permissions === undefined ||
            item.permissions.some((permission) => effectivePermissions.has(permission)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [auth.principal?.permissions, portalName]);

  const contextualLabels = new Set([
    'Graduated',
    'Archived',
    'Senior tracks',
    'Subject offerings',
    'Terms',
    'Assessment configuration',
    'Grading configuration',
    'Submitted results',
    'Review',
    'Approval',
    'Publishing',
    'Corrections',
  ]);
  const visibleNavigation = permittedNavigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (pageSearch.trim() !== '' || !contextualLabels.has(item.label)) &&
          `${group.label} ${item.label}`.toLowerCase().includes(pageSearch.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const currentItem = permittedNavigation
    .flatMap((group) => group.items)
    .filter(
      (item) =>
        location.pathname === item.to ||
        (!['/admin', '/teacher'].includes(item.to) && location.pathname.startsWith(`${item.to}/`)),
    )
    .sort((left, right) => right.to.length - left.to.length)[0];

  const relatedGroup = location.pathname.startsWith('/admin/results')
    ? permittedNavigation.find((group) => group.label === 'Results')
    : permittedNavigation.find((group) => group.items.some((item) => item.to === currentItem?.to));
  const relatedItems = relatedGroup?.items.filter((item) => contextualLabels.has(item.label)) ?? [];

  useEffect(() => {
    document.title = `${currentItem?.label ?? 'Page not found'} · ${portalName} · Onyx College`;
  }, [currentItem?.label, portalName]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia('(min-width: 70.001rem)');
    const closeOnDesktop = () => {
      if (desktop.matches) setNavigationOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (!navigationOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('.portal-sidebar__close')?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false);
      if (event.key === 'Tab') {
        const focusable = sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        );
        const first = focusable?.[0];
        const last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [navigationOpen]);

  return (
    <div className={`portal-shell${navigationOpen ? ' portal-shell--nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <button
        aria-label="Close navigation"
        className="portal-navigation-backdrop"
        onClick={() => {
          setNavigationOpen(false);
        }}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
      />
      <aside
        aria-label={`${portalName} menu`}
        aria-modal={navigationOpen ? true : undefined}
        role={navigationOpen ? 'dialog' : undefined}
        ref={sidebar}
        className="portal-sidebar"
        id="portal-navigation"
      >
        <div className="portal-sidebar__brand">
          <Brand subtitle={portalName} />
          <button
            aria-label="Close navigation"
            className="portal-sidebar__close"
            onClick={() => {
              setNavigationOpen(false);
            }}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <label className="navigation-search">
          <Icon name="search" />
          <input
            aria-label="Find a page"
            placeholder="Find a page…"
            value={pageSearch}
            onChange={(event) => {
              setPageSearch(event.target.value);
            }}
          />
        </label>
        <nav aria-label={`${portalName} navigation`} className="portal-navigation">
          {visibleNavigation.map((group) => (
            <div className="portal-nav-group" key={group.label}>
              <span className="portal-nav-section">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  className={({ isPending }) =>
                    `portal-nav-item${currentItem?.to === item.to ? ' portal-nav-item--active' : ''}${isPending ? ' portal-nav-item--pending' : ''}`
                  }
                  end
                  key={item.to}
                  onClick={() => {
                    setNavigationOpen(false);
                    setPageSearch('');
                  }}
                  to={item.to}
                >
                  <span aria-hidden="true" className="portal-nav-item__icon">
                    <Icon name={navigationIcon(item.to)} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {visibleNavigation.length === 0 ? (
            <p className="navigation-search__empty" role="status">
              No pages found. Try a different name.
            </p>
          ) : null}
        </nav>

        <div className="portal-sidebar__account">
          <span aria-hidden="true" className="portal-user-avatar">
            {initials(auth.principal?.displayName)}
          </span>
          <span>
            <strong>{auth.principal?.displayName}</strong>
            <small>{auth.principal?.username}</small>
          </span>
        </div>
        <div className="portal-sidebar__footer">
          <span className="portal-sidebar__secure-dot" aria-hidden="true" />
          <span>Private school workspace</span>
        </div>
      </aside>

      <div className="portal-main" inert={navigationOpen}>
        <header className="portal-header">
          <div className="portal-header__leading">
            <button
              aria-controls="portal-navigation"
              aria-expanded={navigationOpen}
              aria-label="Open navigation"
              className="portal-menu-button"
              onClick={() => {
                setNavigationOpen(true);
              }}
              type="button"
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
            <div>
              <span className="portal-header__portal">Onyx College / {portalName}</span>
              <strong className="portal-header__context">
                {currentItem?.label ?? 'Workspace'}
              </strong>
            </div>
          </div>
          <div className="portal-header__actions">
            <Link className="portal-header__password" to="/auth/change-password">
              Security
            </Link>
            <SignOutButton />
          </div>
        </header>
        <div className="portal-view" id="main-content" tabIndex={-1}>
          {relatedItems.length > 0 ? (
            <nav className="context-navigation" aria-label="Related pages">
              {relatedItems.map((item) => (
                <NavLink key={item.to} to={item.to} end>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
          <ConnectionStatus />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
