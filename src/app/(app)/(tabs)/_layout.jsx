import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';

// Five destinations, per Android navigation-bar guidance. "Create" lives on
// Home/Events as a primary button; the recipe bank gets a tab of its own.
const TABS = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'feed', title: 'Feed', icon: 'image' },
  { name: 'recipes', title: 'Recipes', icon: 'book' },
  { name: 'events', title: 'Events', icon: 'calendar' },
  { name: 'profile', title: 'Profile', icon: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ focused, color }) => (
              <View style={[s.pill, focused && { backgroundColor: colors.peachSoft }]}>
                <Ionicons name={focused ? t.icon : `${t.icon}-outline`} size={21} color={color} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
