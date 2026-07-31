import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

interface ButtonProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'light';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.primaryLight
          : variant === 'light'
            ? '#FFFFFF'
            : variant === 'ghost'
              ? 'transparent'
              : 'transparent';

  const textColor =
    variant === 'primary' || variant === 'danger'
      ? '#FFFFFF'
      : variant === 'light'
        ? colors.primary
        : variant === 'secondary'
          ? colors.primary
          : variant === 'ghost'
            ? colors.textSecondary
            : colors.primary;

  const sizeStyle = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        sizeStyle,
        {
          backgroundColor: bg,
          borderColor: variant === 'outline' ? colors.border : colors.primary,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          pointerEvents: isDisabled ? 'none' : 'auto',
        },
        variant === 'outline' && styles.outline,
        typeof style === 'function' ? style({ pressed } as never) : style,
      ]}
      disabled={isDisabled}
      onPress={(event) => {
        if (isDisabled) return;
        onPress?.(event);
      }}
      {...props}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSm, size === 'lg' && styles.textLg, { color: textColor }]}>
        {loading ? 'Please wait...' : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { paddingVertical: 10, paddingHorizontal: 16 },
  md: { paddingVertical: 15, paddingHorizontal: 22 },
  lg: { paddingVertical: 18, paddingHorizontal: 24 },
  outline: { borderWidth: 1.5 },
  text: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  textSm: { fontSize: 13 },
  textLg: { fontSize: 17 },
});
