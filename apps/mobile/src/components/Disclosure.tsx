import { Platform, PlatformColor } from 'react-native';
import { SymbolView } from 'expo-symbols';

/**
 * The trailing chevron on a row that navigates. Drawn as the SF Symbol in the
 * system's own disclosure colour, so it matches native list rows and adapts to
 * dark mode. iOS only: SF Symbols don't exist on Android.
 */
export function Disclosure() {
  if (Platform.OS !== 'ios') return null;
  return (
    <SymbolView
      name="chevron.right"
      size={14}
      weight="semibold"
      tintColor={PlatformColor('tertiaryLabel')}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
