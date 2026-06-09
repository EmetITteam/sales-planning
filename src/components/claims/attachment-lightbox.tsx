'use client';

/**
 * AttachmentLightbox — модальний перегляд прикріплення (фото/відео/файл).
 *
 * Використовується у /claims/[id] — клік на превью у деталі або у чаті
 * відкриває цю модалку замість окремої вкладки. Закрити по ESC, click
 * на backdrop або кнопці X. Кнопка «Завантажити» — скачування файлу.
 */

import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import type { ClaimAttachment } from '@/lib/claims/types';

interface Props {
  attachment: ClaimAttachment | null;
  onClose: () => void;
}

export function AttachmentLightbox({ attachment, onClose }: Props) {
  // ESC закриває
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Заборона скролу body
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [attachment, onClose]);

  if (!attachment) return null;

  // Backdrop click закриває (поза контентом)
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 sm:p-8"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative bg-white rounded-2xl shadow-2xl max-w-[min(960px,100%)] max-h-[90vh] w-full flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-emet-ink truncate" title={attachment.name}>
              {attachment.name}
            </div>
          </div>
          <a
            href={attachment.url}
            download={attachment.name}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-slate-200 text-[12px] font-semibold text-slate-700 hover:border-emet-blue hover:text-emet-blue transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Завантажити</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="h-9 w-9 rounded-[10px] border border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 flex items-center justify-center p-2">
          {attachment.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          ) : attachment.kind === 'video' ? (
            <video
              src={attachment.url}
              controls
              autoPlay
              className="max-w-full max-h-[80vh] rounded-lg"
            >
              Ваш браузер не підтримує відео.
            </video>
          ) : (
            <div className="text-center py-12 px-6 space-y-3">
              <div className="text-[14px] text-slate-700 font-medium">
                Прев&apos;ю недоступне для цього типу файла
              </div>
              <a
                href={attachment.url}
                download={attachment.name}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-emet-blue text-white text-[13px] font-bold hover:bg-emet-blue-light transition-colors shadow-md"
              >
                <Download className="w-4 h-4" />
                Завантажити файл
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
