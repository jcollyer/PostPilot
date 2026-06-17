import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Label + input + optional error/hint row. Matches the web app's
 * <Input> + <Label> pair without pulling in a form library.
 */
export function TextField({ label, error, hint, style, ...rest }: Props) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-sm font-medium text-slate-700">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#94a3b8"
        {...rest}
        className={`rounded-lg border bg-white px-3 py-3 text-base text-slate-900 ${
          error ? 'border-destructive' : 'border-border'
        }`}
        style={style}
      />
      {error ? (
        <Text className="text-destructive text-xs">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-slate-500">{hint}</Text>
      ) : null}
    </View>
  );
}
