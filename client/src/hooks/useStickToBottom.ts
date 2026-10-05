import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a scroll container pinned to the bottom while its content grows, as
 * long as the user is at the bottom. Any upward scroll (wheel, touch, keys,
 * scrollbar) releases it; scrolling back to the bottom re-engages it.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const programmatic = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    let lastTop = el.scrollTop;
    const release = () => {
      if (programmatic.current) return;
      stick.current = false;
      setAtBottom(distance() < 4);
    };
    const onScroll = () => {
      const top = el.scrollTop;
      const d = distance();
      const movedUp = top < lastTop - 1;
      lastTop = top;
      if (programmatic.current) {
        if (d < 2) programmatic.current = false;
        return;
      }
      // Content growth never moves scrollTop up, and shrinking content clamps
      // it while staying at the bottom — so only a real upward scroll releases.
      if (d < 4) stick.current = true;
      else if (movedUp) stick.current = false;
      setAtBottom(stick.current || d < 32);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) release();
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
      programmatic.current = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y > touchY + 2) release(); // finger moving down = content scrolling up
      touchY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('textarea, input, [contenteditable]')) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) release();
    };

    const ro = new ResizeObserver(() => {
      if (stick.current) {
        el.scrollTop = el.scrollHeight;
        lastTop = el.scrollTop;
      } else setAtBottom(distance() < 32);
    });
    ro.observe(content);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    setAtBottom(true);
    if (smooth) {
      programmatic.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setTimeout(() => (programmatic.current = false), 800);
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  /** Scrolls to the top and stops following new content (e.g. the welcome screen). */
  const scrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = false;
    el.scrollTop = 0;
  }, []);

  return { scrollRef, contentRef, atBottom, scrollToBottom, scrollToTop };
}
