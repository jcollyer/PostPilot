import { Text, View } from 'react-native';

/**
 * The one-line answer at the top of a monitor screen: a status dot, the state
 * in its tone, then the detail. A healthy state stays ink; only problems take
 * their status colour (Status-Only Saturation).
 */

export type StatusTone = 'critical' | 'warn' | 'ok';

const TONE_DOT: Record<StatusTone, string> = {
  critical: 'bg-signal-critical',
  warn: 'bg-signal-warn',
  ok: 'bg-signal-ok',
};

const TONE_LABEL: Record<StatusTone, string> = {
  critical: 'text-signal-critical',
  warn: 'text-signal-warn',
  ok: 'text-ink',
};

export function StatusLine({
  tone,
  label,
  detail,
  copy,
}: {
  tone: StatusTone;
  label: string;
  detail: string;
  /** `label · detail`, read as one phrase by VoiceOver. */
  copy: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={copy}
      className="flex-row items-start gap-2.5"
    >
      {/* Optically centred on the first line of the 22pt label. */}
      <View className={`mt-[9px] h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
      <Text className="flex-1 text-[22px] leading-7 text-ink-secondary">
        <Text className={`font-semibold ${TONE_LABEL[tone]}`}>{label}</Text>
        {` · ${detail}`}
      </Text>
    </View>
  );
}
