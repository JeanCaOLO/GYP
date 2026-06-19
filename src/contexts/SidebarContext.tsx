import { createContext, useContext, useState, useCallback } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setCollapsedState = useCallback((v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem('sidebar-collapsed', String(v));
    } catch {
      // ignore
    }
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed: setCollapsedState }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}