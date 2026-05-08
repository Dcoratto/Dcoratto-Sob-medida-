import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const [error, setError] = React.useState(false);

  return (
    <div className={`flex items-center ${className}`}>
      {error ?(
        <div className="font-display font-bold text-xl text-slate-900">
          D'Coratto
        </div>
      ) : (
        <img 
          src="/logo.png" 
          alt="D’Coratto Sob Medida" 
          className="h-10 w-auto object-contain max-w-[180px]"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
};
