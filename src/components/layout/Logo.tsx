import React from 'react';

const BRAND_LOGO_SRC = '/logo.png?v=20260611';

const LogoComponent: React.FC<{className?: string}> = ({className}) => {
  const [error, setError] = React.useState(false);

  return (
    <div className={`flex items-center ${className ?? ''}`} aria-label="D'Coratto Sob Medida">
      {error ? (
        <div className="flex h-12 w-36 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white font-display text-base font-bold text-slate-900 shadow-sm">
          D'Coratto
        </div>
      ) : (
        <img
          src={BRAND_LOGO_SRC}
          alt="D'Coratto Sob Medida"
          decoding="async"
          className="h-12 w-40 shrink-0 object-contain object-left"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
};

export const Logo = React.memo(LogoComponent);
