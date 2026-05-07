import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Дозволяє менеджерам поставити Sales Planning на робочий стіл /
 * головний екран телефона як native app (без browser chrome — повноекранно).
 *
 * Як ставити (треба показати юзерам один раз):
 *  - Chrome desktop: ⋮ → "Install Sales Planning" / "Створити ярлик"
 *  - Edge desktop: ⋯ → Apps → "Install this site as an app"
 *  - iOS Safari: Share (квадрат зі стрілкою) → "Add to Home Screen"
 *  - Android Chrome: ⋮ → "Add to Home screen"
 *
 * Після додавання — іконка SP на десктопі/телефоні. Клік відкриває в окремому
 * вікні без адресного рядка, виглядає як native app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EMET Sales Planning',
    short_name: 'Sales Planning',
    description: 'Планування та контроль продажів EMET',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#e8f4fc',
    theme_color: '#066aab',
    lang: 'uk',
    icons: [
      // Іконки runtime-генеруються з src/app/icon.tsx + apple-icon.tsx,
      // Next.js автоматично додає їх у manifest. Тут лишаємо як підстраховку.
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    categories: ['business', 'productivity'],
  };
}
