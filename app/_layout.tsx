import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import { BrandingProvider } from '@/contexts/BrandingContext';
import { UserProvider } from '@/contexts/UserContext';
import { ToastProvider } from '@/components/Toast';

// Fonte padrão da marca TEYVOR (guia oficial): Sora nos títulos,
// Inter no resto. Aplicado uma vez aqui para todo o app, sem precisar
// tocar em cada tela.
// @ts-ignore — defaultProps existe em runtime mesmo sem tipo no RN Web.
Text.defaultProps = Text.defaultProps || {};
// @ts-ignore
Text.defaultProps.style = [
  { fontFamily: 'Inter_400Regular' },
  // @ts-ignore
  Text.defaultProps.style,
];

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#F6F5F2' }} />;
  }

  return (
    <BrandingProvider>
      <UserProvider>
        <ToastProvider>
          <StatusBar style="dark"/>
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </UserProvider>
    </BrandingProvider>
  );
}
