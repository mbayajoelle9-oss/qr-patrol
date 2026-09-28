import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';

function Icon({ glyph, focused, big }: { glyph: string; focused: boolean; big?: boolean }) {
  if (big) {
    return (
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -22,
          borderWidth: 4,
          borderColor: '#000',
        }}
      >
        <Text style={{ fontSize: 26 }}>{glyph}</Text>
      </View>
    );
  }
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: { backgroundColor: '#000', borderTopColor: colors.line, height: 62 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 6 },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ma ronde', tabBarIcon: ({ focused }) => <Icon glyph="🛡️" focused={focused} /> }} />
      <Tabs.Screen name="historique" options={{ title: 'Historique', tabBarIcon: ({ focused }) => <Icon glyph="🕘" focused={focused} /> }} />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Scanner', headerShown: false, tabBarIcon: ({ focused }) => <Icon glyph="📷" focused={focused} big /> }}
      />
      <Tabs.Screen name="incidents" options={{ title: 'Incidents', tabBarIcon: ({ focused }) => <Icon glyph="⚠️" focused={focused} /> }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <Icon glyph="👤" focused={focused} /> }} />
    </Tabs>
  );
}
