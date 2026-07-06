'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Client1C } from '@/lib/types';
import { categoryLabel } from '@/lib/unplanned-buyers';
import { Search, Phone, MapPin, Calendar } from 'lucide-react';

interface ClientSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (client: Client1C) => void;
  excludeIds: string[];
  /** Список клієнтів для пошуку. Передається з planning-form (вже відфільтрований по сегменту з 1С). */
  clients: Client1C[];
  /** true якщо клієнти ще завантажуються з 1С (показуємо плейсхолдер замість «не знайдено»). */
  loading?: boolean;
}

// Колір (badge) — UI-знання, лишається тут. Лейбл — спільний з решти UI.
const CATEGORY_COLOR: Record<Client1C['category'], string> = {
  active: 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm',
  sleeping: 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm',
  lost: 'bg-rose-500/12 border border-rose-300/40 text-rose-700 backdrop-blur-sm',
  new: 'bg-blue-500/12 border border-blue-300/40 text-blue-700 backdrop-blur-sm',
  none: 'bg-slate-400/12 border border-slate-300/50 text-slate-600 backdrop-blur-sm',
};

export function ClientSearchModal({ open, onClose, onSelect, excludeIds, clients, loading }: ClientSearchModalProps) {
  const [query, setQuery] = useState('');

  // Резерв-клієнтів не показуємо у планувальному пошуку (виключені з планування).
  const available = clients.filter(c => !excludeIds.includes(c.clientId) && !c.isReserved);
  const filtered = query.length >= 2
    ? available.filter(c => c.clientName.toLowerCase().includes(query.toLowerCase()))
    : available;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">Пошук клієнта</DialogTitle>
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Пошук клієнта з 1С..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-8 px-0 text-sm"
          />
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && available.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
              Завантажуємо клієнтів…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query.length < 2 ? 'Введіть мінімум 2 символи' : 'Клієнтів не знайдено'}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map(client => {
                const catColor = CATEGORY_COLOR[client.category] ?? CATEGORY_COLOR.none;
                const catLabel = categoryLabel(client.category);
                return (
                  <button
                    key={client.clientId}
                    onClick={() => { onSelect(client); onClose(); setQuery(''); }}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{client.clientName}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          {client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />{client.phone}
                            </span>
                          )}
                          {client.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{client.address}
                            </span>
                          )}
                          {client.lastPurchaseDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />Ост. покупка: {client.lastPurchaseDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ${catColor}`}>
                        {catLabel}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
