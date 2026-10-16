'use client';

import { createContext, useContext, useMemo, useState } from 'react';

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const Ctx = createContext<SidebarState>({ collapsed: false, setCollapsed: () => undefined });

/** Permet à une page (ex. le calendrier) de masquer le menu latéral pour gagner de la place. */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSidebar = () => useContext(Ctx);
