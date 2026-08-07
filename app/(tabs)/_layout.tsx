import { Tabs } from 'expo-router';

import { PremiumTabBar } from '@/components/ui/PremiumTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Time' }} />
      <Tabs.Screen name="leave" options={{ title: 'Leave' }} />
      <Tabs.Screen name="salary" options={{ title: 'Pay' }} />
    </Tabs>
  );
}
