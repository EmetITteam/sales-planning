'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { RMDashboard } from './rm-dashboard';
import { ManagerDashboard } from './manager-dashboard';
import { ChevronRight, MapPin, ClipboardList, AlertTriangle, Users } from 'lucide-react';

type DirView = 'dashboard' | 'myPlanning' | 'viewRM';

/**
 * Тимчасовий вигляд директорського дашборду — поки 1С не здав Action 5.
 * Показуємо:
 *  - кнопку «Моє планування»
 *  - список РМ (зі store.user.managedUsers — Action 1 повертає всіх РМ)
 *  - клік на РМ → відкриває їх RM-дашборд (теж стаб поки нема Action 5)
 *  - банер з поясненням
 */
export function DirectorDashboard() {
  const [view, setView] = useState<DirView>('dashboard');
  const [selectedRM, setSelectedRM] = useState<string>('');

  const { user } = useAppStore();
  const rms = user?.managedUsers ?? [];

  if (view === 'myPlanning') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        <ManagerDashboard />
      </div>
    );
  }

  if (view === 'viewRM') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        {/* RMDashboard поки що теж стаб; коли Action 5 буде — він покаже регіональні агрегати */}
        <RMDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Огляд по компанії</h2>
          <p className="text-[12px] text-muted-foreground">{rms.length} {rms.length === 1 ? 'РМ' : 'РМ'} · {user?.fullName}</p>
        </div>
      </div>

      {/* Banner: Action 5 not ready */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Загальні агрегати по компанії ще не підключені</p>
          <p className="text-amber-700">
            Метод 1С <code className="px-1 rounded bg-amber-100">getRegionData</code> (Action 5)
            ще у розробці. Поки видно тільки список регіональних менеджерів. Клік на РМ відкриває
            їх дашборд (теж тимчасовий — там список менеджерів регіону без агрегатів).
            Менеджерські дашборди — на реальних даних з 1С.
          </p>
        </div>
      </div>

      {/* Моє планування */}
      <button
        onClick={() => setView('myPlanning')}
        className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="text-left flex-1">
          <p className="text-[15px] font-bold text-foreground">Моє планування</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Особистий прогноз по ТМ як у менеджера</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
      </button>

      {/* RM list */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Регіональні менеджери</h3>
        {rms.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-4 text-center">
            У 1С не вказані РМ для цього директора.
          </p>
        ) : (
          <div className="space-y-2">
            {rms.map(login => (
              <button
                key={login}
                onClick={() => { setSelectedRM(login); setView('viewRM'); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center text-[12px] font-bold text-[#066aab] shrink-0">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="flex-1 text-left text-[13px] font-medium truncate">{login}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
