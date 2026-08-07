import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
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
  const { isAuthenticated, isAdmin, logout, adminName } = useApp();
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

  return (
    <>
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
        <Text style={[styles.topTitle, { color: colors.text }]}>Hospital HR · {adminName}</Text>
        <Pressable onPress={handleLogout} hitSlop={8}>
          <Text style={[styles.signOut, { color: colors.danger }]}>Sign out</Text>
        </Pressable>
      </View>
      <Tabs
        screenOptions={{
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.borderLight,
            paddingBottom: Platform.OS === 'ios' ? 22 : 10,
            height: Platform.OS === 'ios' ? 88 : 72,
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
          name="latecomers"
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
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  topTitle: { fontSize: 15, fontWeight: '800' },
  signOut: { fontSize: 13, fontWeight: '700' },
  iconWrap: {
    width: 30,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
