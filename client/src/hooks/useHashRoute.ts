import { useCallback, useSyncExternalStore } from 'react';

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getId = () => /^#\/c\/([\w-]+)$/.exec(window.location.hash)?.[1] ?? null;

/** Minimal hash router: `#/c/<id>` is a conversation, anything else is a new chat. */
export function useConversationRoute() {
  const id = useSyncExternalStore(subscribe, getId);
  const navigate = useCallback((next: string | null) => {
    const hash = next ? `#/c/${next}` : '#/';
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);
  return [id, navigate] as const;
}
