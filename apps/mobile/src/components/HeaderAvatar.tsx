import { useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { trpc } from '../lib/trpc';
import { getInitials } from '../lib/format';

/** Round avatar: the user's photo, or their initials on Navy Wash. */
export function Avatar({ size = 32, ring = false }: { size?: number; ring?: boolean }) {
  const { data: me } = trpc.user.me.useQuery();
  const initials = getInitials(me?.name ?? me?.email);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#dbe2ef',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ? 2 : 0,
        borderColor: '#2d3f63',
      }}
    >
      {me?.image ? (
        <Image source={{ uri: me.image }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: '#2d3f63' }}>{initials}</Text>
      )}
    </View>
  );
}

/**
 * Avatar shown in the Home header. Tapping it switches to the Settings tab —
 * the mobile analog of the web app's avatar dropdown.
 */
export function HeaderAvatar() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.navigate('/settings')} hitSlop={8}>
      <Avatar />
    </Pressable>
  );
}
