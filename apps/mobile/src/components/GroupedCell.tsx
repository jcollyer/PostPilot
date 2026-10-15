import { View } from 'react-native';

/**
 * One slice of an inset-grouped list: a hairline-bounded surface whose top
 * and bottom round off only at the ends of its group. Virtualized lists draw
 * a group out of per-row cells rather than one container around all its rows.
 */
export function Cell({
  first = false,
  last = false,
  children,
}: {
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className="border-hairline bg-surface"
      // Every edge spelled out: a cell must draw no top or bottom rule unless it
      // ends its group, or adjacent cells stack into visible seams.
      style={{
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? 12 : 0,
        borderTopRightRadius: first ? 12 : 0,
        borderBottomLeftRadius: last ? 12 : 0,
        borderBottomRightRadius: last ? 12 : 0,
      }}
    >
      {children}
    </View>
  );
}

/**
 * A row-to-row rule; inset ones start at the text, clear of a row's 36pt
 * thumbnail or glyph, like a native list. Rules live inside the cells: a
 * separate 1pt separator cell leaves seams.
 */
export function Rule({ inset = false }: { inset?: boolean }) {
  return <View className={`h-px bg-hairline ${inset ? 'ml-[64px]' : ''}`} />;
}
