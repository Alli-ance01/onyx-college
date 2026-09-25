import type { RouteObject } from 'react-router';

import { RouteErrorBoundary } from '../error-boundaries/route-error-boundary.js';
import { PortalLayout } from '../layouts/portal-layout.js';
import { PublicLayout } from '../layouts/public-layout.js';
import { FoundationPage } from './foundation-page.js';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <FoundationPage
            description="The React workspace, routing, query client, API boundary, error handling, and design tokens are configured. Product workflows begin in later vertical slices."
            eyebrow="Production workspace"
            title="Onyx College Portal foundation"
          />
        ),
      },
      {
        path: 'auth/*',
        element: (
          <FoundationPage
            description="This route group is reserved for public and authentication experiences. Authentication is intentionally not implemented in this phase."
            eyebrow="Public/Auth route group"
            title="Authentication foundation only"
          />
        ),
      },
    ],
  },
  {
    path: '/student',
    element: <PortalLayout portalName="Student Portal" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <FoundationPage
            description="The Student Portal layout boundary is prepared. No student product screens or workflows exist yet."
            eyebrow="Student Portal"
            title="Student shell"
            variant="portal"
          />
        ),
      },
    ],
  },
  {
    path: '/teacher',
    element: <PortalLayout portalName="Teacher Portal" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <FoundationPage
            description="The Teacher Portal layout boundary is prepared. No teacher product screens or academic authority are implemented."
            eyebrow="Teacher Portal"
            title="Teacher shell"
            variant="portal"
          />
        ),
      },
    ],
  },
  {
    path: '/admin',
    element: <PortalLayout portalName="Admin Portal" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <FoundationPage
            description="The Admin Portal layout boundary is prepared. No administrative product screens or permissions are implemented."
            eyebrow="Admin Portal"
            title="Admin shell"
            variant="portal"
          />
        ),
      },
    ],
  },
];
