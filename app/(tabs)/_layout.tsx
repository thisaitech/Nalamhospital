import { Tabs } from 'expo-router';

import { PremiumTabBar } from '@/components/ui/PremiumTabBar';
import { useApp } from '@/contexts/AppContext';

export default function TabLayout() {
  const { employee } = useApp();
  const isDoctor = employee?.staffCategory === 'doctor';

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
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          // Staff never see Calendar; doctors only.
          href: isDoctor ? undefined : null,
        }}
      />
      <Tabs.Screen name="leave" options={{ title: 'Leave' }} />
      <Tabs.Screen name="salary" options={{ title: 'Pay' }} />
    </Tabs>
  );
}
