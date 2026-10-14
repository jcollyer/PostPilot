import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/**
 * Shared header styling for every tab's stack. Top-level screens get a large
 * collapsing title (DESIGN.md → Navigation "Known gap"); drill-ins inherit
 * the inline title.
 *
 * No `headerStyle.backgroundColor`: under native tabs it blanks the large
 * title on every tab except the first (verified on iOS 26.3). The system
 * header already sits on the Ground via `contentStyle`.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerTitleStyle: { color: '#0f172a', fontWeight: '600' },
  headerTintColor: '#2d3f63',
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  contentStyle: { backgroundColor: '#f8fafc' },
};

export const rootScreenOptions: NativeStackNavigationOptions = {
  headerLargeTitle: true,
};
