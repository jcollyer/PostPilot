import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';

/**
 * Route group for the authenticated app shell. Guests are redirected to the
 * sign-in screen, and an account scheduled for deletion to the restore screen;
 * everyone else gets the native iOS tab bar with four tabs,
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

  // A deleted account in its grace period can sign in, but only to restore.
  if (session.user.deletionScheduledFor) {
    return <Redirect href="/restore-account" />;
  }

  return (
    <NativeTabs tintColor="#2d3f63" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }} />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* `list.number` has no filled variant. */}
      <NativeTabs.Trigger name="queue">
        <NativeTabs.Trigger.Icon sf="list.number" />
        <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
