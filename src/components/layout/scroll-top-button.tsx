/**
 * ScrollTopButton — плаваюча кнопка «до верху» що з'являється коли користувач
 * прокрутив сторінку нижче N px. Корисно на довгих списках (276 клієнтів,
 * багато зустрічей) — швидко повертатись до фільтрів.
 *
 * Тримається у правому нижньому куті. Не блокує контент бо `bottom-4 right-4`
 * + невелика розміром. Z-index нижче ніж модали (50+).
 */

'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

const SHOW_AFTER_PX = 400;

export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Прокрутити до верху"
      title="До верху"
      className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-emet-blue text-white shadow-[0_8px_24px_rgba(6,106,171,0.35)] hover:bg-emet-blue-light hover:shadow-[0_10px_30px_rgba(6,106,171,0.45)] active:scale-95 transition-all inline-flex items-center justify-center"
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  );
}
