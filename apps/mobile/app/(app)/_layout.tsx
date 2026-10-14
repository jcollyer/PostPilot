import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Settings as SettingsIcon, House, Images, ListOrdered } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';
import { Avatar } from '../../src/components/HeaderAvatar';
import { ShellPrefsProvider, useShellPrefs } from '../../src/prototype/ShellPrefs';

/**
 * Route group for the authenticated app shell. Guests are redirected to the
 * sign-in screen; signed-in users get four tabs, each with its own stack.
 *
 * PROTOTYPE: renders either native tabs (UITabBarController, iOS 26 glass)
 * or JS tabs (@react-navigation/bottom-tabs), switchable from Settings.
 */
export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/signin" />;
  }

  return (
    <ShellPrefsProvider>
      <Shell />
    </ShellPrefsProvider>
  );
}

function Shell() {
  const { variant } = useShellPrefs();
  return variant === 'native' ? <NativeShell /> : <JsShell />;
}

function NativeShell() {
  return (
    <NativeTabs tintColor="#2d3f63" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <Icon sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }} />
        <Label>Library</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="queue">
        <Icon sf="list.number" />
        <Label>Queue</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function JsShell() {
  const { avatarTabIcon } = useShellPrefs();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2d3f63',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e2e8f0' },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Library', tabBarIcon: ({ color, size }) => <Images color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="queue"
        options={{ title: 'Queue', tabBarIcon: ({ color, size }) => <ListOrdered color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: avatarTabIcon ? 'You' : 'Settings',
          tabBarIcon: ({ color, size, focused }) =>
            avatarTabIcon ? (
              <Avatar size={size + 2} ring={focused} />
            ) : (
              <SettingsIcon color={color} size={size} />
            ),
        }}
      />
    </Tabs>
  );
}
