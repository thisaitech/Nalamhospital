import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { MobileWebFrame } from '@/components/MobileWebFrame';
import { FloatingNotificationHost } from '@/components/notifications/FloatingNotificationHost';
import { AppProvider, useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { initFirebaseAnalytics } from '@/services/firebase';
import '@/services/firebase';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isAdmin } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';

  useEffect(() => {
    if (isLoading) return;
    const root = segments[0];
    const inAuth = root === 'login';
    const inAdmin = root === 'admin';
    const employeeOnlyRoutes = [
      '(tabs)',
      'profile',
      'leave-request',
      'compensatory-off',
      'punch',
      'announcement',
    ];
    const inEmployeeOnly = employeeOnlyRoutes.includes(root as string);

    if (!isAuthenticated && !inAuth) {
      router.replace('/login');
      return;
    }
    if (isAuthenticated && inAuth) {
      router.replace(isAdmin ? '/admin' : '/(tabs)');
      return;
    }
    if (isAuthenticated && isAdmin && inEmployeeOnly) {
      router.replace('/admin');
      return;
    }
    if (isAuthenticated && !isAdmin && inAdmin) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, isAdmin, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors[scheme].background }}>
        <ActivityIndicator size="large" color={Colors[scheme].primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ionicons: require('../assets/fonts/Ionicons.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppProvider>
      <RootLayoutNav />
    </AppProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    initFirebaseAnalytics().catch(() => {});
  }, []);

  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const customTheme = {
    ...theme,
    colors: {
      ...theme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={customTheme}>
      <MobileWebFrame>
        <AuthGate>
          <View style={{ flex: 1 }}>
            <Stack>
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="admin" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ title: 'Edit Profile', headerBackTitle: 'Back' }} />
              <Stack.Screen name="leave-request" options={{ presentation: 'modal', title: 'Request Leave' }} />
              <Stack.Screen name="compensatory-off" options={{ presentation: 'modal', title: 'Compensatory Off' }} />
              <Stack.Screen name="announcement" options={{ presentation: 'modal', title: 'Admin Message' }} />
              <Stack.Screen name="notifications" options={{ title: 'Requests' }} />
              <Stack.Screen name="punch" options={{ presentation: 'modal', headerShown: false }} />
            </Stack>
            <FloatingNotificationHost />
          </View>
        </AuthGate>
      </MobileWebFrame>
    </ThemeProvider>
  );
}
