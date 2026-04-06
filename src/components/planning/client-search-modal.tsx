'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MOCK_CLIENTS_PETARAN } from '@/lib/mock-data';
import type { Client1C } from '@/lib/types';
import { Search, Phone, MapPin, Calendar } from 'lucide-react';

interface ClientSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (client: Client1C) => void;
  excludeIds: string[];
  segmentCode?: string; // для майбутньої інтеграції з 1С
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активний', color: 'bg-emerald-50 text-emerald-700' },
  sleeping: { label: 'Сплячий', color: 'bg-amber-50 text-amber-700' },
  lost: { label: 'Втрачений', color: 'bg-rose-50 text-rose-700' },
  new: { label: 'Новий', color: 'bg-blue-50 text-blue-700' },
  none: { label: 'Без категорії', color: 'bg-gray-50 text-gray-600' },
};

export function ClientSearchModal({ open, onClose, onSelect, excludeIds, segmentCode }: ClientSearchModalProps) {
  const [query, setQuery] = useState('');

  // В реальности — вызов 1С action findClient з фільтром по segmentCode
  // TODO: використовувати segmentCode для запиту до 1С замість MOCK_CLIENTS_PETARAN
  const allClients = MOCK_CLIENTS_PETARAN.filter(c => !excludeIds.includes(c.clientId));
  const filtered = query.length >= 2
    ? allClients.filter(c => c.clientName.toLowerCase().includes(query.toLowerCase()))
    : allClients;

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
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query.length < 2 ? 'Введіть мінімум 2 символи' : 'Клієнтів не знайдено'}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map(client => {
                const cat = CATEGORY_LABELS[client.category] ?? CATEGORY_LABELS.none;
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
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ${cat.color}`}>
                        {cat.label}
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
