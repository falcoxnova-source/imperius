import { Palmtree } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';

export function VacationBanner() {
  const { profile } = useAuthStore();
  const { t } = useI18n();

  if (!profile?.vacation_mode) return null;

  return (
    <div className="mb-4 rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-950/60 via-cyan-900/40 to-cyan-950/60 backdrop-blur-sm overflow-hidden">
      <div className="relative px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <Palmtree className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <span className="text-sm text-cyan-200 font-medium text-center">
            {t.settings.vacationModeBanner}
          </span>
          <Palmtree className="w-5 h-5 text-cyan-400 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
