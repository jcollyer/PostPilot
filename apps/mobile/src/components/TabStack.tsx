import { Stack } from 'expo-router';

/**
 * One tab's own native stack. The tab's root (`index`) gets a large
 * collapsing title; drill-ins pushed later inherit the inline title.
 *
 * Never set `headerStyle.backgroundColor` here: under native tabs it hides
 * the large title on every tab except the first (verified on iOS 26.3). The
 * system header already sits on the Ground via `contentStyle`.
 *
 * `children` registers the tab's other routes that need their own options,
 * such as a sheet.
 */
export function TabStack({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { color: '#0f172a', fontWeight: '600' },
        headerTintColor: '#2d3f63',
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        contentStyle: { backgroundColor: '#f8fafc' },
      }}
    >
      <Stack.Screen name="index" options={{ title, headerLargeTitle: true }} />
      {children}
    </Stack>
  );
}
