import { ActivityIndicator, Text, View } from 'react-native';

import { trpc } from '../../src/lib/trpc';
import { getFirstName } from '../../src/lib/format';

/**
 * Home screen for authenticated users. Greets the user by first name (falling
 * back to email). The blank canvas for your app's real content.
 */
export default function HomeScreen() {
  const { data: me, isLoading } = trpc.user.me.useQuery();

  if (isLoading && !me) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const greetingName = getFirstName(me?.name, me?.email);

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-8">
      <Text className="text-2xl font-semibold text-slate-900">Hello {greetingName}</Text>
      <Text className="mt-2 text-base text-slate-500">
        You&apos;re signed in. This is your home screen — start building from here.
      </Text>
    </View>
  );
}
