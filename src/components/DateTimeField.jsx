import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { colors, type } from '../theme';
import { Button, Dialog, Icon, IconButton, Label, styles as ui } from './ui';
import { formatValue, parseValue, toValue } from './dateTimeValue';

/**
 * Date / time / date-time input using the phone's native pickers. Values are
 * the same strings as HTML inputs ("2026-10-18", "18:30", "2026-10-18T18:30"),
 * so the form and data layer don't care which platform produced them.
 */
export default function DateTimeField({ label, mode = 'date', value, onChange, placeholder = 'Not set', clearable, disabled, style }) {
  const [iosDraft, setIosDraft] = useState(null);

  const open = () => {
    const start = parseValue(mode, value);
    if (Platform.OS === 'android') {
      // Android has no combined picker: pick the date, then the time.
      const pick = (pickerMode, initial, done) => DateTimePickerAndroid.open({
        value: initial,
        mode: pickerMode,
        onChange: (event, date) => { if (event.type === 'set' && date) done(date); },
      });
      if (mode === 'datetime') {
        pick('date', start, (d) => pick('time', d, (t) => onChange(toValue(mode, t))));
      } else {
        pick(mode, start, (d) => onChange(toValue(mode, d)));
      }
    } else {
      setIosDraft(start);
    }
  };

  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <Pressable onPress={open} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
        style={[ui.input, ui.select, disabled && { backgroundColor: '#f6f0ec' }]}>
        <Icon name={mode === 'time' ? 'time-outline' : 'calendar-outline'} size={18} color={colors.muted} />
        <Text style={[type.body, { flex: 1 }, !value && { color: '#b0a49c' }, disabled && { color: colors.muted }]} numberOfLines={1}>
          {value ? formatValue(mode, value) : placeholder}
        </Text>
        {clearable && value && !disabled ? (
          <IconButton name="close-circle" size={18} color={colors.muted} onPress={() => onChange('')} accessibilityLabel={`Clear ${label}`} />
        ) : null}
      </Pressable>
      {Platform.OS === 'ios' && (
        <Dialog
          visible={Boolean(iosDraft)}
          onClose={() => setIosDraft(null)}
          title={label}
          footer={(
            <>
              <Button title="Cancel" variant="light" onPress={() => setIosDraft(null)} />
              <Button title="Done" onPress={() => { onChange(toValue(mode, iosDraft)); setIosDraft(null); }} />
            </>
          )}
        >
          {iosDraft && (
            <DateTimePicker value={iosDraft} mode={mode} display="spinner" onChange={(_, d) => d && setIosDraft(d)} />
          )}
        </Dialog>
      )}
    </View>
  );
}
