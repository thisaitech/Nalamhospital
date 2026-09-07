import { Tabs, Redirect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { RequestsNotificationIcon } from '@/components/notifications/RequestsNotificationIcon';
import { useColorScheme } from '@/components/useColorScheme';
import { showConfirm } from '@/utils/uiAlert';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ADMIN_TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'grid', inactive: 'grid-outline' },
  attendance: { active: 'time', inactive: 'time-outline' },
  shifts: { active: 'calendar', inactive: 'calendar-outline' },
  approvals: { active: 'checkmark-done-circle', inactive: 'checkmark-done-circle-outline' },
  payroll: { active: 'cash', inactive: 'cash-outline' },
  employees: { active: 'people', inactive: 'people-outline' },
  'new-hire': { active: 'person-add', inactive: 'person-add-outline' },
};

const ADMIN_TAB_COLORS: Record<string, { active: string; inactive: string; bg: string }> = {
  index: { active: '#0F766E', inactive: '#0D9488', bg: '#F0FDFA' },
  attendance: { active: '#0369A1', inactive: '#0284C7', bg: '#F0F9FF' },
  shifts: { active: '#B45309', inactive: '#D97706', bg: '#FFFBEB' },
  approvals: { active: '#059669', inactive: '#059669', bg: '#ECFDF5' },
  payroll: { active: '#7C3AED', inactive: '#8B5CF6', bg: '#F5F3FF' },
  employees: { active: '#0891B2', inactive: '#0891B2', bg: '#ECFEFF' },
  'new-hire': { active: '#DB2777', inactive: '#DB2777', bg: '#FDF2F8' },
};

/** Filled approval badge — blue circle with white check (header + alerts). */

function AdminTabIcon({ routeName, focused }: { routeName: string; focused: boolean }) {
  const icons = ADMIN_TAB_ICONS[routeName] ?? ADMIN_TAB_ICONS.index;
  const palette = ADMIN_TAB_COLORS[routeName] ?? ADMIN_TAB_COLORS.index;

  return (
    <View style={[styles.iconWrap, { backgroundColor: focused ? `${palette.active}22` : palette.bg }]}>
      <Ionicons
        name={focused ? icons.active : icons.inactive}
        size={18}
        color={focused ? palette.active : palette.inactive}
      />
    </View>
  );
}

function adminTabOptions(routeName: string, title: string) {
  const palette = ADMIN_TAB_COLORS[routeName] ?? ADMIN_TAB_COLORS.index;

  return {
    title,
    tabBarActiveTintColor: palette.active,
    tabBarInactiveTintColor: palette.inactive,
    tabBarIcon: ({ focused }: { focused: boolean }) => (
      <AdminTabIcon routeName={routeName} focused={focused} />
    ),
  };
}

export default function AdminLayout() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, logout, adminName, unreadNotificationCount, refreshData } =
    useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }
  if (!isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogout = async () => {
    const confirmed = await showConfirm('Sign out', 'Are you sure you want to sign out?');
    if (confirmed) await logout();
  };

  const tabBarBottomInset = Math.max(
    insets.bottom,
    Platform.select({ ios: 22, android: 12, web: 20, default: 10 }) ?? 10
  );
  const tabBarContentHeight = 56;

  return (
    <View style={styles.layout}>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.borderLight,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
          Hospital HR · {adminName}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={async () => {
              await refreshData();
              router.push('/notifications' as Href);
            }}
            style={({ pressed }) => [styles.notifBtn, { opacity: pressed ? 0.85 : 1 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Requests"
          >
            <RequestsNotificationIcon count={unreadNotificationCount} />
          </Pressable>
          <Pressable onPress={handleLogout} hitSlop={8}>
            <Text style={[styles.signOut, { color: colors.danger }]}>Sign out</Text>
          </Pressable>
        </View>
      </View>
      <Tabs
        screenOptions={{
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.borderLight,
            paddingBottom: tabBarBottomInset,
            height: tabBarContentHeight + tabBarBottomInset,
          },
          headerShown: false,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        }}
      >
        <Tabs.Screen name="index" options={adminTabOptions('index', 'Dashboard')} />
        <Tabs.Screen name="attendance" options={adminTabOptions('attendance', 'Attendance')} />
        <Tabs.Screen name="shifts" options={adminTabOptions('shifts', 'Shifts')} />
        <Tabs.Screen name="approvals" options={adminTabOptions('approvals', 'Leave')} />
        <Tabs.Screen name="payroll" options={adminTabOptions('payroll', 'Payroll')} />
        <Tabs.Screen name="employees" options={adminTabOptions('employees', 'Staff')} />
        <Tabs.Screen
          name="new-hire"
          options={{
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="deleted-staff"
          options={{
            href: null,
            headerShown: true,
            title: 'Deleted staff',
          }}
        />
        <Tabs.Screen
          name="latecomers"
          options={{
            href: null,
            headerShown: true,
          }}
        />
        <Tabs.Screen
          name="employee/[id]"
          options={{
            href: null,
            headerShown: true,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            href: null,
            headerShown: true,
            title: 'Broadcast',
          }}
        />
        <Tabs.Screen
          name="shift-attendance-report"
          options={{
            href: null,
            headerShown: true,
            title: 'Shift Attendance Report',
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  topTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'visible' },
  notifBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  signOut: { fontSize: 13, fontWeight: '700' },
  iconWrap: {
    width: 30,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
