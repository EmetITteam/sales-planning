'use client';

/**
 * LoadingScreen — чистий екран завантаження. Замінює skeleton-плашки
 * для головних сторінок (/clients, /meetings, /claims). Скелетон з пустих
 * placeholder-ів виглядав хаотично, поки контент не завантажився; чистий
 * екран з повідомленням і спіннером — спокійніше і чіткіше.
 *
 * Дизайн: glass-card по центру екрану, EMET-blue rotating ring,
 * заголовок + дрібний підзаголовок.
 */

interface Props {
  title?: string;
  subtitle?: string;
}

export function LoadingScreen({
  title = 'Завантажуємо дані',
  subtitle = 'Зачекайте кілька секунд…',
}: Props) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white/65 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-3xl shadow-[0_10px_40px_rgba(6,42,61,0.06)] px-8 py-10 md:px-14 md:py-12 text-center max-w-[480px] w-full">
        <div className="mx-auto mb-6 w-14 h-14 relative">
          <svg
            className="w-14 h-14 animate-spin text-emet-blue"
            viewBox="0 0 50 50"
            fill="none"
            aria-hidden
          >
            <circle cx="25" cy="25" r="20" stroke="currentColor" strokeOpacity="0.18" strokeWidth="4" />
            <path
              d="M25 5 a20 20 0 0 1 20 20"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="text-[18px] md:text-[20px] font-bold text-emet-ink tracking-tight mb-2">
          {title}
        </h2>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
    </div>
  );
}
