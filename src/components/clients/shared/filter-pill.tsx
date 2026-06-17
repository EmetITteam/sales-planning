import type React from 'react';

/**
 * <FilterPill> — pill-кнопка фільтру (категорія / focus / has-plan).
 * Active: emet-blue background; inactive: glass-white.
 *
 * Виокремлено з clients-page.tsx (Day 2 рефактору god-component).
 */
export function FilterPill({
  active,
  onClick,
  count,
  dotClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  dotClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-all ${
        active
          ? 'bg-emet-blue text-white shadow-[0_4px_12px_rgba(6,106,171,0.25)] border border-emet-blue'
          : 'bg-white/50 border border-white/60 hover:bg-white/70 hover:-translate-y-px'
      }`}
    >
      {dotClass && <span className={`w-2 h-2 rounded-full ${dotClass}`} />}
      <span>{children}</span>
      <span className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-full tabular-nums ${
        active ? 'bg-white/25 text-white' : 'bg-emet-blue/10 text-emet-blue'
      }`}>
        {count}
      </span>
    </button>
  );
}
