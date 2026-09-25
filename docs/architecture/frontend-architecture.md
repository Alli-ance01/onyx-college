# Onyx College Portal — Frontend Architecture

## Purpose

V1 uses one strict TypeScript React single-page application for public/authentication pages and the Student, Teacher, and Admin portals. One application avoids duplicated authentication, contracts, accessibility work, and domain presentation while still enforcing clear feature and route boundaries.

The browser is never authoritative for permissions, calculations, workflow transitions, or data integrity. Frontend authorization controls navigation and presentation; the API independently authorizes every operation.

## Technology direction

- Vite for the browser build and development server.
- React with React Router Data Mode for nested routing, loaders where useful, lazy route modules, pending UI, and route error boundaries without requiring a server-rendering framework.
- TanStack Query for remote/server state, cache invalidation, mutation lifecycle, and request deduplication.
- React Hook Form with Zod integration for form state and syntactic validation.
- Component-local state first; narrowly scoped React context for stable cross-tree concerns such as authenticated principal and UI preferences.
- CSS design tokens and a utility approach such as Tailwind CSS, with accessible headless primitives such as Radix where they reduce risk.
- Vitest, Testing Library, MSW, and Playwright in the eventual test stack.

Redux or Zustand is not required initially. It may be added only for demonstrated complex client-only state that is not remote state, URL state, form state, or local component state.

## Source structure

```text
src/
  app/
    router/
    providers/
    layouts/
    error-boundaries/
  features/
    auth/
    registration/
    student-profile/
    academics/
    enrollments/
    teachers/
    teaching-assignments/
    assignments/
    announcements/
    results/
    documents/
    notifications/
    access-control/
    settings/
  components/
    ui/
    domain/
  lib/
    api/
    auth/
    validation/
    observability/
  styles/
```

A feature owns its route-facing screens, feature components, hooks, query keys, request functions, form adapters, and feature tests. It imports generic presentation primitives but must not mutate another feature's cache through ad hoc keys. Cross-feature domain displays belong in `components/domain` only after genuine reuse appears.

`components/ui` has no knowledge of Student, Enrollment, Result, permissions, or API response shapes. It contains replaceable, accessible primitives such as Button, Dialog, Field, Table, Badge, Tabs, and pagination controls. Domain components compose these primitives and format explicit view models. This separation allows the initial visual system to be replaced without rewriting workflows.

## Route organization

```text
/
  login
  forgot-password
  reset-password
  student-signup
  registration/*
  force-password-change

/student/*
  dashboard, assignments, announcements, results, subjects,
  academic-history, documents, profile, notifications, settings

/teacher/*
  dashboard, my-classes, my-subjects, students, assignments,
  results, announcements, notifications, profile, settings

/admin/*
  dashboard, students/*, teachers/*, academics/*, assignments,
  announcements, results/*, access/*, documents, audit,
  notifications, settings
```

PublicLayout, AuthLayout, RegistrationLayout, StudentLayout, TeacherLayout, and AdminLayout own shell concerns. Nested route modules are lazy-loaded at feature boundaries. Deep links are stable and authorization-aware. A user with multiple permitted experiences receives an explicit experience switcher rather than a different application.

Student registration access depends on account/registration state, not the global STUDENT role. Full portal routes remain unavailable until approval. Forced password change routes take precedence over portal access.

## Data flow and state ownership

### Server state

TanStack Query owns fetched users, registrations, enrollments, assignments, results, documents, notifications, configuration, and other remote state. Query keys are factories scoped by feature and include filters/context. Mutation success updates exact cached records or invalidates explicit keys; broad global invalidation is avoided.

Sensitive data receives short cache times and is removed on logout/account switch. Persisting the query cache to browser storage is disabled by default. Medical data, results, private object URLs, and tokens are never placed in localStorage.

### URL state

List filters, pagination cursors where shareable, sort, search, tabs, and reporting context belong in validated URL search parameters. This makes administrative workflows linkable and prevents a global store from becoming a hidden navigation system.

### Form state

React Hook Form owns interactive form state. Zod provides immediate syntax feedback using shared client-safe schemas where appropriate. API validation errors are mapped by stable field paths. Business conflicts remain server errors and are displayed as workflow-level feedback rather than duplicated as frontend rules.

Registration form rendering consumes the immutable configuration version assigned to the registration. Known conditional domain rules are presented in the UI, but the server revalidates them. Draft preservation must be deliberate and must not place sensitive registration data in insecure browser storage.

### Local UI state

Disclosure, selection, transient dialogs, and responsive navigation are local. Theme and allowed display preferences can use a small UI context and non-sensitive local persistence.

## API client

One base client owns API origin, JSON parsing, timeout/abort behavior, request ID propagation, access-token attachment, one coordinated refresh-and-retry attempt, and normalized API errors. Feature clients expose typed operations such as `approveRegistration` or `submitResultBatch`; components do not build URLs directly.

The access token is held only in memory. On a fresh page load, the auth provider calls the refresh/session endpoint using the protected cookie, establishes the principal, and then releases protected routes. Concurrent 401 responses share one refresh promise to avoid refresh-token rotation races. A failed refresh clears sensitive caches and returns to login.

Request and response DTOs come from `packages/contracts` when client-safe. Persistence documents and backend domain entities never cross the frontend boundary.

## Authorization and navigation

The authenticated-principal response exposes only the effective permissions and high-level portal/lifecycle facts needed to render navigation. It does not claim teacher scope for arbitrary resources. Scope-aware screens request authorized server projections for the selected session/class/subject.

Frontend helpers answer presentation questions such as `canShow(permission)` and ownership-aware affordances. They do not implement final academic-scope or resource-state authorization. A hidden button is usability; a server policy is security.

Route gates handle:

- authenticated versus anonymous;
- forced password change;
- account state;
- registration versus approved portal lifecycle;
- required broad permission/experience.

Every forbidden or stale response has a safe user-facing state. The app does not infer access from role names alone.

## Error and loading design

- A root error boundary handles unrecoverable rendering failures and reports a safe release/request context.
- Each portal layout has a boundary so one experience can fail without destroying the auth shell.
- Route/feature boundaries provide contextual retry and preserve navigation.
- Query errors distinguish offline/network, validation, unauthenticated, forbidden, not found, stale/conflict, rate-limited, and unexpected failures.
- Mutations disable only the relevant action and use idempotency keys for retryable commands.
- Skeletons or compact placeholders preserve layout; critical tables include explicit empty, filtered-empty, and error states.

Unexpected error screens never display stack traces or raw server messages.

## Responsive and accessible design

The application is mobile-first while prioritizing efficient desktop administration. Layout breakpoints respond to content rather than particular device models. Wide tables provide controlled horizontal scrolling or purpose-built compact cards; they do not silently hide authoritative columns. Dense admin views and focused student/teacher views may use different composition while sharing primitives.

Use semantic HTML, keyboard-complete interactions, visible focus, accessible names, properly associated field errors, reduced-motion support, adequate contrast, and screen-reader announcements for async outcomes. Accessibility is part of component acceptance, not a later visual pass.

The initial dark-navy/amber direction is expressed through tokens: color, typography, spacing, radii, elevation, and state colors. Business logic never imports theme tokens. No workflow depends on a specific card/table implementation.

## Security in the browser

- Do not use `dangerouslySetInnerHTML` for announcements or instructions. If rich text is later approved, sanitize it with a narrowly configured parser on both write and display boundaries.
- Do not persist access/refresh credentials or sensitive server caches in web storage.
- Treat signed file URLs as credentials: do not log, prefetch, share, or persist them; open only after an explicit authorized action.
- Use a restrictive Content Security Policy and avoid arbitrary third-party scripts.
- Do not cache authenticated API responses or private file downloads in a future service worker.
- Clear query caches, principal state, object URLs, and sensitive form state on logout.

## PWA and Android readiness

The SPA shell and route design allow a web app manifest, service worker, install prompt, and push subscription feature to be added later. Notification delivery remains behind the backend channel abstraction. HTTPS, stable icons, offline shell behavior, and cache rules can be introduced without changing business features.

Offline mutation of authoritative academic/admin data is not assumed. Any future offline feature requires a conflict and privacy design. Packaging the web application for Android must preserve the same API authorization and secure credential strategy; it does not convert the client into a trusted actor.

## References

- [React Router modes](https://reactrouter.com/start/modes)
- [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview)
- [React security and escaping](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
