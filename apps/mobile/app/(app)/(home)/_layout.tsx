import { Stack } from 'expo-router';

import { HeaderAvatar } from '../../../src/components/HeaderAvatar';
import { rootScreenOptions, stackScreenOptions } from '../../../src/components/stackOptions';
import { useShellPrefs } from '../../../src/prototype/ShellPrefs';

export default function HomeStack() {
  const { homeAvatar } = useShellPrefs();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{
          ...rootScreenOptions,
          title: 'Home',
          headerRight: homeAvatar ? () => <HeaderAvatar /> : undefined,
        }}
      />
    </Stack>
  );
}
