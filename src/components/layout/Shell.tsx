import React from 'react';
import { Sidebar } from './Sidebar';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-[#FBFBFD]">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="h-full p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
