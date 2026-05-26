'use client';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" — червона кнопка (для destructive дій). "default" — синя. */
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Малий confirm-діалог замість browser-native `confirm()`.
 *
 * Чому не browser confirm():
 *  - Блокує render thread → лагає у Chrome на iOS
 *  - Іноді не показується (Safari iframe / Playwright)
 *  - Не стилізується — виглядає інакше за решту UI
 *  - Доступність: native confirm не передає focus куди треба
 *
 * Цей — побудований на base shadcn Dialog. Минимально-інвазивно.
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = 'Підтвердити', cancelLabel = 'Скасувати',
  variant = 'default', onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm p-5 gap-3 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${
            variant === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-emet-50 text-emet-blue'
          }`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[14px] font-bold leading-tight">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-[12px] text-muted-foreground mt-1">
                {description}
              </DialogDescription>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onCancel} className="h-9 px-4 text-[13px]">
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={`h-9 px-4 text-[13px] text-white ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb]'
            }`}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
