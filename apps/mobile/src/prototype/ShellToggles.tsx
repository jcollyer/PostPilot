import { Switch, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { useShellPrefs } from './ShellPrefs';

/** PROTOTYPE: flip tab-shell variants live. Remove with the prototype. */
export function ShellToggles() {
  const p = useShellPrefs();
  return (
    <Card className="mb-4 gap-3 border-dashed p-4">
      <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">Prototype · tab shell</Text>
      <Row
        label="Native tabs (iOS 26 glass)"
        hint="Off = JS tabs with lucide icons"
        value={p.variant === 'native'}
        onChange={(v) => p.setVariant(v ? 'native' : 'js')}
      />
      <Row label="Avatar in Home header" hint="Taps through to this tab" value={p.homeAvatar} onChange={p.setHomeAvatar} />
      <Row
        label="Avatar as Settings tab icon"
        hint="JS tabs only; native tabs take SF Symbols or images"
        value={p.avatarTabIcon}
        onChange={p.setAvatarTabIcon}
        disabled={p.variant === 'native'}
      />
    </Card>
  );
}

function Row(props: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3" style={{ opacity: props.disabled ? 0.5 : 1 }}>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-900">{props.label}</Text>
        <Text className="text-xs text-slate-500">{props.hint}</Text>
      </View>
      <Switch value={props.value} onValueChange={props.onChange} disabled={props.disabled} trackColor={{ true: '#2d3f63' }} />
    </View>
  );
}
