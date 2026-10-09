import { useEffect } from 'react';
import { useBlocker } from 'react-router';

const dirtyPages = new Set<symbol>();
export function confirmDiscardUnsavedChanges(): boolean {
  return (
    dirtyPages.size === 0 || window.confirm('You have unsaved changes. Sign out and discard them?')
  );
}
/** One guard per page; keep edits in memory rather than persisting private fields in browser storage. */
export function useUnsavedChanges(dirty: boolean): void {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave this page and discard them?'))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const page = Symbol('unsaved-page');
    dirtyPages.add(page);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      dirtyPages.delete(page);
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);
}
