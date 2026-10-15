import { Platform, PlatformColor } from 'react-native';
import { SymbolView } from 'expo-symbols';

/**
 * The trailing chevron on a row that navigates or expands. Drawn as the SF
 * Symbol in the system's own disclosure colour, so it matches native list rows
 * and adapts to dark mode. `open` points it down, for a row that expands in
 * place. iOS only: SF Symbols don't exist on Android.
 */
export function Disclosure({ open = false }: { open?: boolean }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <SymbolView
      name={open ? 'chevron.down' : 'chevron.right'}
      size={14}
      weight="semibold"
      tintColor={PlatformColor('tertiaryLabel')}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/**
 * The trailing arrow on a row that leaves the app for the web, in the same
 * colour as the chevron so the two read as one family. iOS only.
 */
export function OutboundMark() {
  if (Platform.OS !== 'ios') return null;
  return (
    <SymbolView
      name="arrow.up.right"
      size={13}
      weight="semibold"
      tintColor={PlatformColor('tertiaryLabel')}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
