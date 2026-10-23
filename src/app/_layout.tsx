import '../global.css';

import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppStoreProvider, useAppStore } from '@/store/useAppStore';
import { paletteCssVars } from '@/theme/palette';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
  });

  return (
    <AppStoreProvider>
      <ThemeRoot ready={fontsLoaded || !!fontError}>
        <RootStack />
      </ThemeRoot>
    </AppStoreProvider>
  );
}

/** Applies the Night-Vision / Standard palette to NativeWind tokens and React Navigation. */
function ThemeRoot({ ready, children }: { ready: boolean; children: ReactNode }) {
  const { palette, hydrated } = useAppStore();
  const show = ready && hydrated;

  useEffect(() => {
    if (show) SplashScreen.hideAsync();
  }, [show]);

  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: palette.primary,
        background: palette.bg,
        card: palette.bg,
        text: palette.primary,
        border: palette.border,
        notification: palette.accent,
      },
    }),
    [palette],
  );

  if (!show) return null;

  return (
    <ThemeProvider value={navTheme}>
      <View style={[{ flex: 1, backgroundColor: palette.bg }, vars(paletteCssVars(palette))]}>
        <StatusBar style="light" />
        {children}
      </View>
    </ThemeProvider>
  );
}

function RootStack() {
  const { palette } = useAppStore();
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="calendar" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
