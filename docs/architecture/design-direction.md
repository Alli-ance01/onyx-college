# Onyx visual identity

The school’s requested direction evolved to a vibrant, friendly aesthetic tailored for secondary school students/teenagers (28 October 2026), adopting **Concept 2: Warm Sunset Gradient & Cheerful Pastel**. This changes presentation, color palette, and micro-interactions, while strictly preserving academic rules, permissions, auditability, and data integrity.

The visual reference balances warmth and high energy: radiant sunset coral/amber hero banners, friendly off-white canvas, vibrant color-coded lesson blocks (mint, sky, amber, berry, violet), high-contrast legible typography, and the preserved school crest.

## System

- **Primary Brand Gradient & Accents**: Warm sunset orange-to-amber gradient (`linear-gradient(135deg, #ff5e36, #ff893b, #fba625)`) is used for primary CTAs, student greeting banners, and active markers. Accent colors (coral, amber, mint teal, sky cyan, rose/violet) provide joyful visual separation for subject chips, timetable periods, and status pills.
- **Surfaces & Borders**: Soft warm off-white canvas (`#fdfaf6`), clean white panel surfaces (`#ffffff`), and warm sand borders (`#f1e4d6`) replace cold monochrome dividers.
- **Typography**: DM Sans is the self-hosted interface face. Newsreader is the self-hosted editorial heading face. Font files are bundled; no third-party font requests occur at runtime.
- The supplied crest is displayed without redrawing or recolouring it. A CSS viewport excludes the poster's repeated bottom wordmark; the source asset is preserved.
- Tables, forms, buttons, loading, errors, and empty states share one visual system. Touch targets are at least 44px for primary controls. Keyboard focus is visible; motion respects reduced-motion preferences.
- Navigation is permission-filtered. Common destinations sit in the sidebar; related views live in contextual navigation. Page search finds permitted destinations, never private records. Existing deep links remain supported. Unknown addresses show a recovery page within the appropriate workspace.
- Overviews show real data and next actions. Missing/loading data is never rendered as a fabricated zero. There are no invented charts, school statistics, or activity feeds.

- Student-directory search, filters, and pagination are stored in the URL so profile navigation, reloads, and shared links preserve the view. Extra filters are expandable on all screen sizes.
- Feature routes load separately. Initial route loading has a visible status, and pending navigation is indicated in the sidebar.

## Maintenance

Structural feature styles live in `global.css`; the active brand tokens live in `school-design.css`; and student/agenda/timetable components live in `daily-school.css`. All visual updates use semantic CSS tokens rather than ad-hoc inline styles.

