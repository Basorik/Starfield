import { Tabs } from 'expo-router';
import { CalendarClock, Crosshair, Settings } from 'lucide-react-native';

import { useAppStore } from '@/store/useAppStore';

export default function TabLayout() {
  const { palette } = useAppStore();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { backgroundColor: palette.bg, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Polar Scope', tabBarIcon: ({ color, size }) => <Crosshair color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="planner"
        options={{ title: 'Planner', tabBarIcon: ({ color, size }) => <CalendarClock color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  );
}
