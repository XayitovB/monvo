import { useEffect, useState } from 'react';

/**
 * Ekran tor (mobil / Telegram Mini App) yoki yo'qligini qaytaradi.
 * Standart chegara: 860px (sidebar + kontent sig'maydigan kenglik).
 */
export function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}
