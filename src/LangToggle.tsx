import { setLang, tx, useLang } from './i18n';

interface LangToggleProps {
  compact?: boolean;
  className?: string;
}

export function LangToggle({ compact = false, className = '' }: LangToggleProps) {
  const lang = useLang();

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-white/15 bg-black/45 p-0.5 text-[11px] font-bold tracking-wider backdrop-blur-sm ${className}`}
      role="group"
      aria-label={tx('Language', 'Bahasa')}
    >
      {!compact && (
        <span className="flex items-center gap-1 px-1.5 text-white/60" aria-hidden="true">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        </span>
      )}
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`rounded-md px-2 py-1 transition-colors cursor-pointer ${
          lang === 'en'
            ? 'bg-amber-400 text-slate-950 shadow-sm'
            : 'text-white/70 hover:text-white'
        }`}
        aria-pressed={lang === 'en'}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('id')}
        className={`rounded-md px-2 py-1 transition-colors cursor-pointer ${
          lang === 'id'
            ? 'bg-amber-400 text-slate-950 shadow-sm'
            : 'text-white/70 hover:text-white'
        }`}
        aria-pressed={lang === 'id'}
        title="Bahasa Indonesia"
      >
        ID
      </button>
    </div>
  );
}

export default LangToggle;
