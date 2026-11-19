// Unsaved changes (MH-06 Change booking): while `active` is true, a refresh or closing the tab makes the browser
// ask first (its own text: browsers ignore a custom message). Navigation inside the app is not blocked.
// Kept on its own so the team can replace it later (e.g. with a saved draft).
import { useEffect } from 'react';

export function useUnsavedChangesWarning(active) {
  useEffect(() => {
    if (!active) return undefined;
    function warn(event) {
      event.preventDefault();
      event.returnValue = ''; // older browsers need it set
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
