import React from 'react';
import { Sidebar } from './Sidebar';
import {GlobalSearch} from './GlobalSearch';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBFBFD] lg:flex-row">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#FBFBFD]/95 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:px-4 md:px-6 lg:px-8 lg:pt-3">
          <div className="flex min-w-0 items-center gap-4">
            <GlobalSearch />
          </div>
        </div>
        <div className="h-full p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:p-4 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
