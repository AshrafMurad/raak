import { useEffect, useRef } from 'react';

// A single feedback layer: no remounts, delayed input, layout animation or row stagger.
export function usePreviewFeedback<T extends HTMLElement>(result: string) {
  const ref = useRef<T>(null);
  const previous = useRef(result);

  useEffect(() => {
    if (previous.current === result) return;
    previous.current = result;
    const node = ref.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!node || preference.matches) return;

    const animation = node.animate([{ opacity: 0.78 }, { opacity: 1 }], {
      duration: 140,
      easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    });
    const stop = () => animation.cancel();
    preference.addEventListener('change', stop);
    return () => {
      stop();
      preference.removeEventListener('change', stop);
    };
  }, [result]);

  return ref;
}
