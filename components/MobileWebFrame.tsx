import { Platform, StyleSheet, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { MOBILE_WEB_MAX_WIDTH } from '@/constants/mobileWeb';

export function MobileWebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const shellColor = scheme === 'dark' ? '#0f172a' : '#dbe4f0';

  return (
    <View style={[styles.shell, { backgroundColor: shellColor }]}>
      <View style={[styles.frame, { backgroundColor: colors.background, maxWidth: MOBILE_WEB_MAX_WIDTH }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    minHeight: '100dvh',
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    minHeight: '100dvh',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.14)',
        } as object)
      : null),
  },
});
