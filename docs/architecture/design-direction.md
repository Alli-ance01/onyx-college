# Onyx visual identity

The school’s requested direction is light blue, replacing the initial navy/amber MVP styling at the school owner's request (8 October 2026). This changes presentation and navigation, not academic rules, permissions, or data models.

The visual reference is a school journal: sky-blue margins, white pages, clear ink typography, the supplied school crest, and the school's actual motto, “We trust in excellence.” Public and authentication pages introduce the school; workspaces keep tasks compact and readable.

## System

- Sky blue is the identity colour, used for navigation, selected rows, section markers, and contextual surfaces. Deep blue provides contrast for primary actions and text. Status colours remain semantic.
- DM Sans is the self-hosted interface face. Newsreader is the self-hosted editorial heading face. Font files are bundled; no third-party font requests occur at runtime.
- The supplied crest is displayed without redrawing or recolouring it. A CSS viewport excludes the poster's repeated bottom wordmark; the source asset is preserved.
- Tables, forms, buttons, loading, errors, and empty states share one visual system. Touch targets are at least 44px for primary controls. Keyboard focus is visible; motion respects reduced-motion preferences.
- Navigation is permission-filtered. Common destinations sit in the sidebar; related views live in contextual navigation. Page search finds permitted destinations, never private records. Existing deep links remain supported. Unknown addresses show a recovery page within the appropriate workspace.
- Overviews show real data and next actions. Missing/loading data is never rendered as a fabricated zero. There are no invented charts, school statistics, or activity feeds.

- Student-directory search, filters, and pagination are stored in the URL so profile navigation, reloads, and shared links preserve the view. Extra filters are expandable on all screen sizes.
- Feature routes load separately. Initial route loading has a visible status, and pending navigation is indicated in the sidebar.

## Maintenance

Structural feature styles live in `global.css`; the active brand and responsive composition live in `school-design.css`. The earlier stacked MVP visual refreshes are removed. Changes to this direction should update these tokens and components rather than introducing another override theme.
