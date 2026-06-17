import { useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { trpc } from '../lib/trpc';
import { getInitials } from '../lib/format';

/**
 * Round avatar shown in the navigation header. Tapping it opens Settings —
 * the mobile analog of the web app's avatar dropdown.
 */
export function HeaderAvatar() {
  const router = useRouter();
  const { data: me } = trpc.user.me.useQuery();

  const initials = getInitials(me?.name ?? me?.email);

  return (
    <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: '#dbe2ef',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {me?.image ? (
          <Image source={{ uri: me.image }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        ) : (
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2d3f63' }}>{initials}</Text>
        )}
      </View>
    </Pressable>
  );
}
