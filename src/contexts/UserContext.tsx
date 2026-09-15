import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { getStoredUser } from '@/services/api';
import type { User } from '@/types/api';

type UserContextValue = {
  user: User | null;
  permissions: Set<string>;
  isAdmin: boolean;
  hasPermission: (key: string) => boolean;
  setUser: (user: User | null) => void;
  reloadStoredUser: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  permissions: new Set(),
  isAdmin: false,
  hasPermission: () => true,
  setUser: () => {},
  reloadStoredUser: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

  const reloadStoredUser = useCallback(async () => {
    const stored = await getStoredUser();
    setUserState(stored);
  }, []);

  useEffect(() => {
    reloadStoredUser();
  }, [reloadStoredUser]);

  const value = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    const permissions = new Set(user?.permissions || []);
    return {
      user,
      permissions,
      isAdmin,
      hasPermission: (key: string) => isAdmin || permissions.has(key),
      setUser: setUserState,
      reloadStoredUser,
    };
  }, [user, reloadStoredUser]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
