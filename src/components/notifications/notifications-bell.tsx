'use client';

/**
 * NotificationsBell — bell icon + badge у app-header. Клік відкриває
 * NotificationsDropdown з останніми сповіщеннями.
 *
 * Polling 30с — щоб лічильник оновлювався поки користувач на іншій вкладці.
 * При першому фокусі на сторінку — revalidate (SWR default).
 */

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Bell, X, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import type { Notification } from '@/lib/notifications/types';

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export function NotificationsBell() {
  const user = useAppStore(s => s.user);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();

  const swrKey = user ? 'notifications-list' : null;
  const { data, mutate } = useSWR<NotificationsResponse>(
    swrKey,
    async () => {
      const r = await fetch('/api/notifications?limit=30', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    },
  );

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const markRead = async (id: string) => {
    // Optimistic: одразу прибираємо з UI
    const optimistic = {
      ...data!,
      notifications: notifications.map(n =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
      unreadCount: Math.max(0, unreadCount - 1),
    };
    mutate(optimistic, { revalidate: false });
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      mutate(); // re-fetch on error
    }
  };

  const markAllRead = async () => {
    const optimistic = {
      ...data!,
      notifications: notifications.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      unreadCount: 0,
    };
    mutate(optimistic, { revalidate: false });
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      mutate();
    }
  };

  const handleClickItem = async (n: Notification) => {
    if (!n.readAt) await markRead(n.id);
    setOpen(false);
    if (n.link) {
      // Якщо link на /claims/12 — додатково revalidate claims-list щоб
      // badge «Нове» на самій сторінці теж пропав.
      router.push(n.link);
      if (n.link.startsWith('/claims')) {
        globalMutate('claims-list');
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unreadCount > 0 ? `${unreadCount} непрочитаних сповіщень` : 'Сповіщення'}
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-[10px] transition-all ${
          open
            ? 'bg-emet-blue text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-emet-blue'
        }`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold tabular-nums shadow-sm ${
              open ? 'bg-white text-emet-blue' : 'bg-rose-500 text-white'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-32px)] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="text-[14px] font-bold text-emet-ink">Сповіщення</div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emet-blue hover:bg-emet-blue/10"
                  title="Прочитати всі"
                >
                  <Check className="w-3 h-3" />
                  Всі
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-200/60 inline-flex items-center justify-center"
                aria-label="Закрити"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-slate-500">
                Немає сповіщень
              </div>
            ) : (
              notifications.map(n => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={() => handleClickItem(n)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = !notification.readAt;
  const tone = TONE_BY_TYPE[notification.type] ?? TONE_BY_TYPE.system;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 ${
        isUnread ? 'bg-emet-blue/[0.03]' : ''
      }`}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full">
        {isUnread && <div className={`w-full h-full rounded-full ${tone.dot}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] ${isUnread ? 'font-semibold' : 'font-medium'} text-emet-ink leading-tight`}>
          {notification.title}
        </div>
        {notification.message && (
          <div className="text-[11.5px] text-slate-600 mt-0.5 line-clamp-2">
            {notification.message}
          </div>
        )}
        <div className="text-[10.5px] text-slate-400 mt-1 tabular-nums">
          {formatRelativeTime(notification.createdAt)}
        </div>
      </div>
    </button>
  );
}

const TONE_BY_TYPE: Record<string, { dot: string }> = {
  claim_new_comment: { dot: 'bg-rose-500' },
  claim_status_changed: { dot: 'bg-emet-blue' },
  meeting_reminder: { dot: 'bg-amber-500' },
  birthday_today: { dot: 'bg-pink-500' },
  system: { dot: 'bg-slate-500' },
};

function formatRelativeTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'щойно';
    if (diffMin < 60) return `${diffMin} хв тому`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} год тому`;
    const sameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    if (sameDay) return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleString('uk-UA', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
