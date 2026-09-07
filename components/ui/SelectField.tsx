import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SelectOption } from '@/constants/leaveOptions';

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  cardColor: string;
  dangerColor: string;
  primaryColor: string;
  compact?: boolean;
  hideLeadingIcon?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  error,
  disabled = false,
  textColor,
  mutedColor,
  borderColor,
  cardColor,
  dangerColor,
  primaryColor,
  compact = false,
  hideLeadingIcon = false,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const hasError = Boolean(error);
  const selected = options.find((option) => option.value === value);

  const fieldStyle = [
    styles.fieldWrap,
    {
      borderColor: hasError ? dangerColor : borderColor,
      backgroundColor: hasError ? 'rgba(220, 38, 38, 0.06)' : cardColor,
      borderWidth: hasError ? 2 : 1,
      opacity: disabled ? 0.6 : 1,
    },
  ];

  if (Platform.OS === 'web') {
    return (
      <View style={compact ? styles.compactWrap : undefined}>
        {label ? (
          <Text style={[styles.label, compact && styles.labelCompact, { color: mutedColor }]}>{label}</Text>
        ) : null}
        <View style={fieldStyle}>
          <select
            aria-label={label || placeholder}
            aria-invalid={hasError}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: selected ? textColor : mutedColor,
              fontSize: compact ? 14 : 16,
              fontWeight: 500,
              fontFamily: 'inherit',
              padding: compact ? '10px 0' : '12px 0',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <View pointerEvents="none" style={styles.trailingIcon}>
            <Ionicons name="chevron-down" size={18} color={hasError ? dangerColor : mutedColor} />
          </View>
        </View>
        {hasError ? <Text style={[styles.error, { color: dangerColor }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={open ? styles.openWrap : undefined}>
      {label ? (
        <Text style={[styles.label, compact && styles.labelCompact, { color: mutedColor }]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen((prev) => !prev)}
        style={fieldStyle}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
      >
        {!hideLeadingIcon ? (
          <Ionicons name="chevron-down" size={18} color={hasError ? dangerColor : primaryColor} />
        ) : null}
        <Text style={[styles.valueText, compact && styles.valueTextCompact, { color: selected ? textColor : mutedColor }]}>
          {selected?.label ?? placeholder}
        </Text>
        {hideLeadingIcon ? (
          <View pointerEvents="none" style={styles.trailingIcon}>
            <Ionicons name="chevron-down" size={18} color={hasError ? dangerColor : mutedColor} />
          </View>
        ) : null}
      </Pressable>

      {open ? (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: cardColor,
              borderColor: hasError ? dangerColor : borderColor,
            },
          ]}
        >
          {placeholder ? (
            <Pressable
              onPress={() => {
                onChange('');
                setOpen(false);
              }}
              style={[styles.option, { borderBottomColor: borderColor }]}
            >
              <Text style={[styles.optionText, { color: mutedColor }]}>{placeholder}</Text>
            </Pressable>
          ) : null}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor: active ? `${primaryColor}14` : 'transparent',
                    borderBottomColor: borderColor,
                  },
                ]}
              >
                <Text style={[styles.optionText, { color: active ? primaryColor : textColor }]}>
                  {option.label}
                </Text>
                {active ? <Ionicons name="checkmark" size={18} color={primaryColor} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasError ? <Text style={[styles.error, { color: dangerColor }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    marginBottom: 10,
  },
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
    gap: 8,
  },
  trailingIcon: {
    marginLeft: 4,
  },
  valueText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 12,
  },
  valueTextCompact: {
    fontSize: 14,
    paddingVertical: 10,
  },
  error: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  openWrap: {
    zIndex: 20,
  },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    paddingRight: 12,
  },
});
