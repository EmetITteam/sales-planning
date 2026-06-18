/**
 * Спільні утиліти для 4 Hero cards «Мої клієнти».
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */

export const fmtUSD = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

/**
 * Card styling — flex-col + gap-3, БЕЗ justify-between.
 *
 * Чому: великі цифри сидять одразу під label на одному вертикальному рівні
 * у всіх 4 картках. Раніше justify-between розводив зверху-знизу і цифри
 * стрибали залежно від обсягу нижнього контенту.
 */
export const heroCardCls = 'glass-card p-5 relative flex flex-col gap-3 fade-stagger';
