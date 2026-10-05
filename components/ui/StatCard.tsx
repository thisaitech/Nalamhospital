import { StyleSheet, Text, View } from 'react-native';
import { AppSymbol } from '@/components/ui/AppSymbol';

import Colors from '@/constants/Colors';
import { PAID_SYMBOL, PENDING_WRONG_SYMBOL } from '@/constants/statusSymbols';
import { useColorScheme } from '@/components/useColorScheme';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: string;
  icon?: { ios: string; android: string; web: string };
  statusSymbol?: 'paid' | 'pending';
  compact?: boolean;
  centered?: boolean;
}

export function StatCard({
  label,
  value,
  subtitle,
  accent,
  icon,
  statusSymbol,
  compact = false,
  centered = false,
}: StatCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const symbol = statusSymbol === 'paid' ? PAID_SYMBOL : statusSymbol === 'pending' ? PENDING_WRONG_SYMBOL : null;
  const symbolBg =
    statusSymbol === 'paid' ? colors.success : statusSymbol === 'pending' ? colors.warning : accent ?? colors.primary;
  const hasHeaderIcon = Boolean(symbol || icon);

  const iconNode = symbol ? (
    <View style={[styles.iconWrap, { backgroundColor: statusSymbol === 'paid' ? colors.successLight : colors.warningLight }]}>
      <View style={[styles.symbolCircle, { backgroundColor: symbolBg }]}>
        <Text style={styles.symbolText}>{symbol}</Text>
      </View>
    </View>
  ) : icon ? (
    <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
      <AppSymbol name={icon} tintColor={accent ?? colors.primary} size={15} />
    </View>
  ) : null;

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        centered && styles.cardCentered,
        { backgroundColor: colors.card, borderColor: colors.borderLight, shadowColor: colors.shadow },
      ]}
    >
      {hasHeaderIcon ? (
        <View style={[styles.headerRow, compact && styles.headerRowCompact, centered && styles.headerRowCentered]}>
          {iconNode}
          <Text
            style={[
              styles.label,
              styles.labelInline,
              compact && styles.labelCompact,
              centered && styles.labelCentered,
              { color: colors.textMuted },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </View>
      ) : (
        <Text style={[styles.label, compact && styles.labelCompact, centered && styles.labelCentered, { color: colors.textMuted }]}>
          {label}
        </Text>
      )}
      <Text
        style={[
          styles.value,
          compact && styles.valueCompact,
          centered && styles.valueCentered,
          { color: accent ?? colors.text },
        ]}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, centered && styles.subtitleCentered, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '46%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardCompact: {
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  cardCentered: { alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerRowCompact: { marginBottom: 2, gap: 5 },
  headerRowCentered: { justifyContent: 'center' },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  symbolCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  labelCompact: { marginBottom: 0, fontSize: 9, letterSpacing: 0.3, lineHeight: 12 },
  labelInline: { flex: 1, marginBottom: 0, lineHeight: 12 },
  labelCentered: { flex: 0, textAlign: 'center' },
  value: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  valueCompact: { fontSize: 20, marginTop: 0, lineHeight: 24 },
  valueCentered: { textAlign: 'center', width: '100%' },
  subtitle: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  subtitleCentered: { textAlign: 'center', width: '100%' },
});
