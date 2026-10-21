import { createElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme';
import { Label } from './ui';
import { setDatePart, setTimePart } from './dateTimeValue';

const INPUT_TYPE = { date: 'date', time: 'time' };

/** Web build: the browser's own date/time inputs (same string values as native). */
export default function DateTimeField({ label, mode = 'date', value, onChange, disabled, clearable, style }) {
  const input = (kind, part, change) => createElement('input', {
    type: INPUT_TYPE[kind],
    value: part ?? '',
    disabled,
    'aria-label': mode === 'datetime' ? `${label} ${kind}` : label,
    onChange: (e) => change(e.target.value),
    style: {
      font: 'inherit', fontSize: 16, padding: '10px 14px', borderRadius: 12,
      border: `1px solid ${colors.inputLine}`, background: disabled ? '#f6f0ec' : colors.white,
      color: colors.ink, minHeight: 48, boxSizing: 'border-box', width: '100%', minWidth: 0,
      WebkitAppearance: 'auto', appearance: 'auto', colorScheme: 'light',
    },
  });
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      {mode === 'datetime' ? (
        <View style={{ gap: 8 }}>
          {input('date', value?.split('T')[0], (date) => onChange(setDatePart(value, date)))}
          {input('time', value?.split('T')[1], (time) => onChange(setTimePart(value, time)))}
        </View>
      ) : input(mode, value, onChange)}
      {clearable && value && !disabled && <Pressable accessibilityRole="button" onPress={() => onChange('')} style={{ paddingVertical: 8 }}><Text style={{ color: colors.coral }}>Clear {label}</Text></Pressable>}
    </View>
  );
}
