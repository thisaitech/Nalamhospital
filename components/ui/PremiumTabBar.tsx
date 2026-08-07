import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { TAB_NAV_ICONS, TAB_COLORS, type TabPictureKey } from '@/constants/tabPictures';
import { useColorScheme } from '@/components/useColorScheme';

const ROUTE_TO_TAB: Record<string, TabPictureKey> = {
  index: 'home',
  attendance: 'time',
  leave: 'leave',
  salary: 'pay',
};

type PremiumTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function PremiumTabBar({ state, descriptors, navigation }: PremiumTabBarProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 20 : 12);

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: bottomInset + 8,
          backgroundColor: colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.96)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
            shadowColor: isDark ? '#000' : colors.shadow,
          },
        ]}
      >
        {state.routes
          .map((route, index) => ({ route, index }))
          .filter(({ route }) => descriptors[route.key].options.href !== null)
          .map(({ route, index }) => {
          const focused = state.index === index;
          const tabKey = ROUTE_TO_TAB[route.name] ?? 'home';
          const icons = TAB_NAV_ICONS[tabKey];
          const tabColors = TAB_COLORS[tabKey];
          const label = descriptors[route.key].options.title ?? icons.label;
          const iconName = (focused ? icons.active : icons.inactive) as IoniconName;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
            >
              <View style={styles.iconSlot}>
                {focused ? (
                  <View style={[styles.activeGlow, { shadowColor: tabColors.icon }]}>
                    <LinearGradient
                      colors={[tabColors.gradientStart, tabColors.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.activeChip}
                    >
                      <Ionicons name={iconName} size={22} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.inactiveIconWrap,
                      { backgroundColor: isDark ? tabColors.iconBgDark : tabColors.iconBg },
                    ]}
                  >
                    <Ionicons name={iconName} size={25} color={tabColors.icon} />
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  focused
                    ? { color: tabColors.icon, fontWeight: '700' }
                    : { color: tabColors.icon, fontWeight: '500', opacity: 0.72 },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {focused ? <View style={[styles.activeDot, { backgroundColor: tabColors.icon }]} /> : <View style={styles.dotSpacer} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 4,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 64,
    gap: 4,
  },
  iconSlot: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeGlow: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 8,
  },
  activeChip: {
    width: 52,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveIconWrap: {
    width: 52,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  dotSpacer: {
    width: 4,
    height: 4,
    marginTop: 1,
    opacity: 0,
  },
});
