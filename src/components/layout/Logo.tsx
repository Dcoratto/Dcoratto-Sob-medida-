import React from 'react';

const BRAND_LOGO_SRC = '/logo.png';

const LogoComponent: React.FC<{className?: string}> = ({className}) => {
  const [error, setError] = React.useState(false);

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`} aria-label="D'Coratto">
      {error ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white font-display text-base font-bold text-slate-900 shadow-sm">
          D'
        </div>
      ) : (
        <img
          src={BRAND_LOGO_SRC}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="h-9 w-9 shrink-0 object-contain"
          onError={() => setError(true)}
        />
      )}
      <span className="whitespace-nowrap font-display text-lg font-bold text-slate-950">
        D'Coratto
      </span>
    </div>
  );
};

export const Logo = React.memo(LogoComponent);
