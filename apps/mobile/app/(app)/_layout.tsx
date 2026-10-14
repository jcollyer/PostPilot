import { Redirect } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';

/**
 * Route group for the authenticated app shell. Guests are redirected to the
 * sign-in screen; signed-in users get the native iOS tab bar with four tabs,
 * each owning its own stack so switching tabs keeps every tab's place.
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
    <NativeTabs tintColor="#2d3f63" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <Icon sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }} />
        <Label>Library</Label>
      </NativeTabs.Trigger>
      {/* `list.number` has no filled variant. */}
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
