import { useMemo } from 'react';

import { useBranding } from '@/contexts/BrandingContext';

// Cores estruturais fixas (não variam por cliente). A cor de marca
// ("gold"/"primary" e "secondary") vem dinamicamente do tenant autenticado
// via useThemeColors() — nunca importe `theme.colors` direto num arquivo
// que precise refletir a marca do cliente logado.
export const theme = {
  colors: {
    bg: '#F6F5F2',
    surface: '#FFFFFF',
    text: '#171717',
    muted: '#5F6670',
    black: '#111111',
    border: '#DEDCD5',
    success: '#2F7D4A',
    danger: '#A63D40'
  },
  radius: { sm: 10, md: 16, lg: 22 },
  typography: {
    family: {
      body: 'Inter_400Regular',
      medium: 'Inter_600SemiBold',
      strong: 'Inter_700Bold',
      title: 'Sora_700Bold',
    },
    size: {
      caption: 12,
      body: 14,
      control: 14,
      section: 18,
      page: 24,
    },
  },
};

export function useThemeColors() {
  const { branding } = useBranding();

  return useMemo(
    () => ({
      ...theme.colors,
      gold: branding.color_primary,
      primary: branding.color_primary,
      secondary: branding.color_secondary,
      brandName: branding.brand_name,
      logoUrl: branding.logo_url,
    }),
    [branding]
  );
}

export type ThemeColors = ReturnType<typeof useThemeColors>;
