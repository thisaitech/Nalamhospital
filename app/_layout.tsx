import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { MobileWebFrame } from '@/components/MobileWebFrame';
import { FloatingNotificationHost } from '@/components/notifications/FloatingNotificationHost';
import { AppProvider, useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { initFirebaseAnalytics } from '@/services/firebase';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'login',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

class StartupErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { message };
  }

  render() {
    if (this.state.message) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Nalam Healthcare</Text>
          <Text style={{ fontSize: 15, lineHeight: 22 }}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

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
  const fontMap =
    Platform.OS === 'web'
      ? {
          SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
          ionicons: require('../assets/fonts/Ionicons.ttf'),
        }
      : {
          SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
        };
  const [loaded, error] = useFonts(fontMap);

  useEffect(() => {
    if (error) {
      console.warn('[fonts] Failed to load custom fonts, using system fonts.', error);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [loaded]);

  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <StartupErrorBoundary>
      <AppProvider>
        <RootLayoutNav />
      </AppProvider>
    </StartupErrorBoundary>
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
            {Platform.OS !== 'web' ? <FloatingNotificationHost /> : null}
          </View>
        </AuthGate>
      </MobileWebFrame>
    </ThemeProvider>
  );
}
