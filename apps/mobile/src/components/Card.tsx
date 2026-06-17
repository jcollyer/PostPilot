import { View, type ViewProps } from 'react-native';

/** Plain white rounded card. Screens handle their own spacing and content. */
export function Card({ className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View {...rest} className={`border-border rounded-xl border bg-white ${className ?? ''}`} />
  );
}
