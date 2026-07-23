import { useEffect, useState, useCallback } from 'react';

// Minimal pathname-based router — no react-router dependency needed for a
// handful of static routes (legal pages) alongside the app's own in-memory
// 'studio' / 'buy-credits' navigation.
export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
    }
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  return [path, navigate];
}
