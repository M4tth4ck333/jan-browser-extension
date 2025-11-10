import { PropsWithChildren, useLayoutEffect } from 'react';

const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(PREFERS_DARK_QUERY);
}

function applyColorScheme(isDark: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const body = document.body;

  root.classList.toggle('dark', isDark);
  root.style.setProperty('color-scheme', isDark ? 'dark' : 'light');
  root.dataset.theme = isDark ? 'dark' : 'light';

  if (body) {
    body.classList.toggle('dark', isDark);
    body.style.setProperty('color-scheme', isDark ? 'dark' : 'light');
    body.dataset.theme = isDark ? 'dark' : 'light';
  }
}

function initializeColorSchemeSync() {
  const mediaQuery = getMediaQuery();
  if (!mediaQuery) {
    return;
  }

  applyColorScheme(mediaQuery.matches);
}

if (typeof document !== 'undefined') {
  initializeColorSchemeSync();
}

export function BrowserThemeSync({ children }: PropsWithChildren): JSX.Element {
  useLayoutEffect(() => {
    const mediaQuery = getMediaQuery();
    if (!mediaQuery) {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      applyColorScheme(event.matches);
    };

    applyColorScheme(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return <>{children}</>;
}
