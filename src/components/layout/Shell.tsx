import React from 'react';
import { Sidebar } from './Sidebar';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBFBFD] lg:flex-row">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="h-full p-3 pb-28 pt-4 sm:p-4 sm:pb-28 md:p-6 md:pb-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
