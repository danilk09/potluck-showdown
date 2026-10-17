import { createElement } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { Label } from './ui';

const INPUT_TYPE = { date: 'date', time: 'time', datetime: 'datetime-local' };

/** Web build: the browser's own date/time inputs (same string values as native). */
export default function DateTimeField({ label, mode = 'date', value, onChange, disabled, style }) {
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      {createElement('input', {
        type: INPUT_TYPE[mode],
        value: value ?? '',
        disabled,
        'aria-label': label,
        onChange: (e) => onChange(e.target.value),
        style: {
          font: 'inherit',
          fontSize: 16,
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${colors.inputLine}`,
          background: disabled ? '#f6f0ec' : colors.white,
          color: colors.ink,
          minHeight: 46,
          boxSizing: 'border-box',
          width: '100%',
        },
      })}
    </View>
  );
}
