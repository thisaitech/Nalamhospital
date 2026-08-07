import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, isValid, parseISO } from 'date-fns';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatDateInput } from '@/utils/leaveValidation';

interface DateInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label: string;
  placeholder?: string;
  error?: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  cardColor: string;
  dangerColor: string;
  primaryColor: string;
  compact?: boolean;
}

function sanitizeDateInput(text: string): string {
  return formatDateInput(text);
}

function parseDateValue(value: string): Date {
  if (value.length >= 10) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
  }
  return new Date();
}

export function DateInputField({
  value,
  onChange,
  onBlur,
  label,
  placeholder = 'YYYY-MM-DD',
  error,
  textColor,
  mutedColor,
  borderColor,
  cardColor,
  dangerColor,
  primaryColor,
  compact = false,
}: DateInputFieldProps) {
  const hasError = Boolean(error);
  const [showPicker, setShowPicker] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDateValue(value));
  const webDateRef = useRef<HTMLInputElement | null>(null);

  const fieldStyle = [
    styles.fieldWrap,
    {
      borderColor: hasError ? dangerColor : borderColor,
      backgroundColor: hasError ? 'rgba(220, 38, 38, 0.06)' : cardColor,
      borderWidth: hasError ? 2 : 1,
    },
  ];

  const openPicker = () => {
    setDraftDate(parseDateValue(value));
    if (Platform.OS === 'web') {
      const input = webDateRef.current;
      if (!input) return;
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
      return;
    }
    setShowPicker(true);
  };

  const applyPickedDate = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setShowPicker(false);
  };

  const handleNativeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'dismissed') {
      setShowPicker(false);
      return;
    }
    if (Platform.OS === 'android' && date) {
      applyPickedDate(date);
      return;
    }
    if (date) setDraftDate(date);
  };

  const calendarIcon = (
    <Pressable
      onPress={openPicker}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Choose ${label}`}
      style={styles.iconBtn}
    >
      <Ionicons name="calendar-outline" size={20} color={hasError ? dangerColor : primaryColor} />
    </Pressable>
  );

  if (Platform.OS === 'web') {
    return (
      <View>
        <Text style={[styles.label, compact && styles.labelCompact, { color: mutedColor }]}>{label}</Text>
        <View style={fieldStyle}>
          {calendarIcon}
          <input
            ref={webDateRef}
            type="date"
            aria-hidden
            tabIndex={-1}
            value={value.length >= 10 ? value : ''}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value);
            }}
            style={{
              position: 'absolute',
              opacity: 0,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            inputMode="numeric"
            aria-label={label}
            aria-invalid={hasError}
            value={value}
            maxLength={10}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(sanitizeDateInput(event.target.value));
            }}
            onBlur={onBlur}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: hasError ? `2px solid ${dangerColor}` : 'none',
              background: 'transparent',
              color: textColor,
              fontSize: 16,
              fontWeight: 500,
              fontFamily: 'inherit',
              padding: '12px 0',
            }}
          />
        </View>
        {hasError ? <Text style={[styles.error, { color: dangerColor }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.label, compact && styles.labelCompact, { color: mutedColor }]}>{label}</Text>
      <View style={fieldStyle}>
        {calendarIcon}
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={value}
          onChangeText={(text) => onChange(sanitizeDateInput(text))}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          keyboardType="number-pad"
          maxLength={10}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={label}
        />
      </View>
      {hasError ? <Text style={[styles.error, { color: dangerColor }]}>{error}</Text> : null}

      {Platform.OS === 'android' && showPicker ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="default"
          onChange={handleNativeChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowPicker(false)} />
          <View style={[styles.sheet, { backgroundColor: cardColor, borderColor }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: borderColor }]}>
              <Pressable onPress={() => setShowPicker(false)} hitSlop={12}>
                <Text style={[styles.sheetAction, { color: mutedColor }]}>Cancel</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, { color: textColor }]}>{label}</Text>
              <Pressable onPress={() => applyPickedDate(draftDate)} hitSlop={12}>
                <Text style={[styles.sheetAction, { color: primaryColor, fontWeight: '700' }]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draftDate}
              mode="date"
              display="spinner"
              onChange={handleNativeChange}
              themeVariant="light"
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  labelCompact: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 0,
    marginBottom: 4,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 10,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 12,
  },
  error: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetAction: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 56,
  },
});
