import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PerformanceModeContextType {
  isPerformanceMode: boolean;
  togglePerformanceMode: () => void;
}

const PerformanceModeContext = createContext<PerformanceModeContextType>({
  isPerformanceMode: false,
  togglePerformanceMode: () => {},
});

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);

  const togglePerformanceMode = () => {
    setIsPerformanceMode(prev => {
      const newValue = !prev;
      console.log(`Performance Mode: ${newValue ? 'ENABLED' : 'DISABLED'}`);
      return newValue;
    });
  };

  return (
    <PerformanceModeContext.Provider value={{ isPerformanceMode, togglePerformanceMode }}>
      {children}
    </PerformanceModeContext.Provider>
  );
}

export function usePerformanceMode() {
  return useContext(PerformanceModeContext);
}
