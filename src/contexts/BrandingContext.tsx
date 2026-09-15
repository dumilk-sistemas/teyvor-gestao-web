import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { getStoredBranding } from '@/services/api';
import type { Branding } from '@/types/api';

export const TEYVOR_DEFAULT_BRANDING: Branding = {
  brand_name: 'TEYVOR',
  logo_url: null,
  color_primary: '#0077FF',
  color_secondary: '#00B8C9',
};

type BrandingContextValue = {
  branding: Branding;
  setBranding: (branding: Branding) => void;
  reloadStoredBranding: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: TEYVOR_DEFAULT_BRANDING,
  setBranding: () => {},
  reloadStoredBranding: async () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<Branding>(TEYVOR_DEFAULT_BRANDING);

  const reloadStoredBranding = useCallback(async () => {
    const stored = await getStoredBranding();
    setBrandingState(stored || TEYVOR_DEFAULT_BRANDING);
  }, []);

  useEffect(() => {
    reloadStoredBranding();
  }, [reloadStoredBranding]);

  const value = useMemo(
    () => ({
      branding,
      setBranding: setBrandingState,
      reloadStoredBranding,
    }),
    [branding, reloadStoredBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
