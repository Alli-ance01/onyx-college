import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { SignOutButton } from '../../features/auth/sign-out-button.js';

type PortalName = 'Admin Portal' | 'Student Portal' | 'Teacher Portal';

interface PortalLayoutProps {
  portalName: PortalName;
}

interface NavigationItem {
  label: string;
  permissions?: readonly string[];
  shortLabel: string;
  to: string;
}

interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
}

const studentNavigation: readonly NavigationGroup[] = [
  {
    label: 'Student portal',
    items: [
      { label: 'Dashboard', shortLabel: 'D', to: '/student/dashboard' },
      { label: 'Assignments', shortLabel: 'A', to: '/student/assignments' },
      { label: 'Announcements', shortLabel: 'N', to: '/student/announcements' },
      { label: 'Results', shortLabel: 'R', to: '/student/results' },
      { label: 'Subjects', shortLabel: 'S', to: '/student/subjects' },
      { label: 'Academic history', shortLabel: 'H', to: '/student/academic-history' },
      { label: 'Documents', shortLabel: 'F', to: '/student/documents' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Profile', shortLabel: 'P', to: '/student/profile' },
      { label: 'Notifications', shortLabel: 'N', to: '/student/notifications' },
      { label: 'Settings', shortLabel: 'S', to: '/student/settings' },
    ],
  },
];

const teacherNavigation: readonly NavigationGroup[] = [
  {
    label: 'Teaching',
    items: [
      { label: 'Dashboard', shortLabel: 'D', to: '/teacher' },
      {
        label: 'My classes',
        permissions: ['students.read', 'enrollments.read'],
        shortLabel: 'C',
        to: '/teacher/classes',
      },
      {
        label: 'My subjects',
        permissions: ['students.read', 'enrollments.read'],
        shortLabel: 'S',
        to: '/teacher/subjects',
      },
      {
        label: 'Students',
        permissions: ['students.read'],
        shortLabel: 'ST',
        to: '/teacher/students',
      },
      {
        label: 'Assignments',
        permissions: ['assignments.create', 'assignments.update', 'assignments.publish'],
        shortLabel: 'A',
        to: '/teacher/assignments',
      },
      {
        label: 'Results',
        permissions: ['results.enter', 'results.submit', 'results.request_correction'],
        shortLabel: 'R',
        to: '/teacher/results',
      },
      {
        label: 'Announcements',
        permissions: ['announcements.create_scoped', 'announcements.update_own'],
        shortLabel: 'N',
        to: '/teacher/announcements',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Notifications', shortLabel: 'N', to: '/teacher/notifications' },
      { label: 'Profile', shortLabel: 'P', to: '/teacher/profile' },
      { label: 'Settings', shortLabel: 'S', to: '/teacher/settings' },
    ],
  },
];

const adminNavigation: readonly NavigationGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', shortLabel: 'D', to: '/admin' }],
  },
  {
    label: 'Students',
    items: [
      {
        label: 'All students',
        permissions: ['students.read'],
        shortLabel: 'ST',
        to: '/admin/students',
      },
      {
        label: 'Registration review',
        permissions: ['students.approve_registration'],
        shortLabel: 'RR',
        to: '/admin/students/registrations',
      },
      {
        label: 'Profiles',
        permissions: ['students.read'],
        shortLabel: 'P',
        to: '/admin/students/profiles',
      },
      {
        label: 'Academic history',
        permissions: ['enrollments.read'],
        shortLabel: 'H',
        to: '/admin/students/academic-history',
      },
      {
        label: 'Graduated',
        permissions: ['students.read'],
        shortLabel: 'G',
        to: '/admin/students/graduated',
      },
      {
        label: 'Archived',
        permissions: ['students.read'],
        shortLabel: 'AR',
        to: '/admin/students/archived',
      },
      {
        label: 'Correction requests',
        permissions: ['students.manage_corrections'],
        shortLabel: 'CR',
        to: '/admin/students/corrections',
      },
    ],
  },
  {
    label: 'Teachers',
    items: [
      {
        label: 'All teachers',
        permissions: ['teachers.read'],
        shortLabel: 'T',
        to: '/admin/teachers',
      },
      {
        label: 'Pending approvals',
        permissions: ['teachers.approve'],
        shortLabel: 'PA',
        to: '/admin/teachers/approvals',
      },
      {
        label: 'Invitations',
        permissions: ['teachers.invite', 'teachers.create'],
        shortLabel: 'I',
        to: '/admin/teachers/invitations',
      },
      {
        label: 'Profiles',
        permissions: ['teachers.read'],
        shortLabel: 'P',
        to: '/admin/teachers/profiles',
      },
      {
        label: 'Teaching assignments',
        permissions: ['teachers.assign'],
        shortLabel: 'TA',
        to: '/admin/teachers/assignments',
      },
    ],
  },
  {
    label: 'Academic structure',
    items: [
      {
        label: 'Sessions',
        permissions: ['sessions.manage'],
        shortLabel: 'SE',
        to: '/admin/academics/sessions',
      },
      {
        label: 'Terms',
        permissions: ['terms.manage'],
        shortLabel: 'TM',
        to: '/admin/academics/terms',
      },
      {
        label: 'Classes',
        permissions: ['classes.manage'],
        shortLabel: 'CL',
        to: '/admin/academics/classes',
      },
      {
        label: 'Senior tracks',
        permissions: ['tracks.manage'],
        shortLabel: 'TR',
        to: '/admin/academics/tracks',
      },
      {
        label: 'Subjects',
        permissions: ['subjects.manage'],
        shortLabel: 'SU',
        to: '/admin/academics/subjects',
      },
      {
        label: 'Subject offerings',
        permissions: ['subject_offerings.manage'],
        shortLabel: 'SO',
        to: '/admin/academics/subject-offerings',
      },
      {
        label: 'Promotions',
        permissions: ['enrollments.promote'],
        shortLabel: 'PR',
        to: '/admin/academics/promotions',
      },
    ],
  },
  {
    label: 'Academic operations',
    items: [
      {
        label: 'Assignments',
        permissions: ['assignments.manage_all'],
        shortLabel: 'A',
        to: '/admin/assignments',
      },
      {
        label: 'Announcements',
        permissions: ['announcements.create_schoolwide', 'announcements.manage_all'],
        shortLabel: 'N',
        to: '/admin/announcements',
      },
      {
        label: 'Result overview',
        permissions: ['results.read_all', 'results.review', 'results.approve', 'results.publish'],
        shortLabel: 'R',
        to: '/admin/results',
      },
    ],
  },
  {
    label: 'Results',
    items: [
      {
        label: 'Assessment configuration',
        permissions: ['results.configure'],
        shortLabel: 'AC',
        to: '/admin/results/assessment-schemes',
      },
      {
        label: 'Grading configuration',
        permissions: ['results.configure'],
        shortLabel: 'GC',
        to: '/admin/results/grading-schemes',
      },
      {
        label: 'Submitted results',
        permissions: ['results.read_all', 'results.review'],
        shortLabel: 'SR',
        to: '/admin/results/submitted',
      },
      {
        label: 'Review',
        permissions: ['results.review'],
        shortLabel: 'RV',
        to: '/admin/results/review',
      },
      {
        label: 'Approval',
        permissions: ['results.approve'],
        shortLabel: 'AP',
        to: '/admin/results/approval',
      },
      {
        label: 'Publishing',
        permissions: ['results.publish'],
        shortLabel: 'PB',
        to: '/admin/results/publishing',
      },
      {
        label: 'Corrections',
        permissions: ['results.approve_correction', 'results.read_all'],
        shortLabel: 'CR',
        to: '/admin/results/corrections',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Administrators',
        permissions: ['admins.create', 'admins.manage'],
        shortLabel: 'AD',
        to: '/admin/access/administrators',
      },
      {
        label: 'Roles',
        permissions: ['roles.manage'],
        shortLabel: 'RO',
        to: '/admin/access/roles',
      },
      {
        label: 'Permissions',
        permissions: ['permissions.manage'],
        shortLabel: 'PE',
        to: '/admin/access/permissions',
      },
      {
        label: 'Documents',
        permissions: ['documents.read', 'documents.review', 'documents.configure'],
        shortLabel: 'F',
        to: '/admin/documents',
      },
      {
        label: 'Audit logs',
        permissions: ['audit.read'],
        shortLabel: 'AU',
        to: '/admin/audit',
      },
      { label: 'Notifications', shortLabel: 'N', to: '/admin/notifications' },
      {
        label: 'School settings',
        permissions: ['settings.manage'],
        shortLabel: 'S',
        to: '/admin/settings',
      },
    ],
  },
];

function navigationFor(portalName: PortalName): readonly NavigationGroup[] {
  if (portalName === 'Student Portal') return studentNavigation;
  if (portalName === 'Teacher Portal') return teacherNavigation;
  return adminNavigation;
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

  const currentItem = permittedNavigation
    .flatMap((group) => group.items)
    .filter((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    .sort((left, right) => right.to.length - left.to.length)[0];

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
          'a[href], button:not([disabled])',
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
          <Link className="brand brand--inverse" to="/" aria-label="Onyx College Portal home">
            <span className="brand__mark" aria-hidden="true">
              O
            </span>
            <span>
              <strong>Onyx College</strong>
              <small>{portalName}</small>
            </span>
          </Link>
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

        <nav aria-label={`${portalName} navigation`} className="portal-navigation">
          {permittedNavigation.map((group) => (
            <div className="portal-nav-group" key={group.label}>
              <span className="portal-nav-section">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  className={() =>
                    `portal-nav-item${currentItem?.to === item.to ? ' portal-nav-item--active' : ''}`
                  }
                  end
                  key={item.to}
                  onClick={() => {
                    setNavigationOpen(false);
                  }}
                  to={item.to}
                >
                  <span aria-hidden="true" className="portal-nav-item__icon">
                    {item.shortLabel}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
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
        <div className="portal-view" id="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
