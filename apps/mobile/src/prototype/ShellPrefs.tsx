import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * PROTOTYPE ONLY (wayfinder: "Prototype the tab shell"). Runtime toggles so
 * the tab-shell variants can be compared side by side in the Simulator
 * without a restart. Delete once the shell decision lands.
 */
export type TabVariant = 'native' | 'js';

type ShellPrefs = {
  variant: TabVariant;
  setVariant: (v: TabVariant) => void;
  /** Keep the avatar in the Home header (jumps to the Settings tab). */
  homeAvatar: boolean;
  setHomeAvatar: (v: boolean) => void;
  /** JS variant only: render the user's avatar as the Settings tab icon. */
  avatarTabIcon: boolean;
  setAvatarTabIcon: (v: boolean) => void;
};

const Ctx = createContext<ShellPrefs | null>(null);

export function ShellPrefsProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<TabVariant>('native');
  const [homeAvatar, setHomeAvatar] = useState(false);
  const [avatarTabIcon, setAvatarTabIcon] = useState(false);
  return (
    <Ctx.Provider
      value={{ variant, setVariant, homeAvatar, setHomeAvatar, avatarTabIcon, setAvatarTabIcon }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useShellPrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShellPrefs must be used inside ShellPrefsProvider');
  return v;
}
