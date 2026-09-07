import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

const BELL_BLUE = '#0EA5E9';
const BADGE_RED = '#EF4444';

interface RequestsNotificationIconProps {
  count?: number;
  size?: number;
}

export function RequestsNotificationIcon({ count = 0, size = 26 }: RequestsNotificationIconProps) {
  const badgeLabel = count > 99 ? '99+' : String(count);
  const iconSize = size;
  const badgeSize = Math.max(14, Math.round(size * 0.54));

  return (
    <View style={[styles.wrap, { width: size + 6, height: size + 2 }]}>
      <Ionicons name="notifications" size={iconSize} color={BELL_BLUE} />
      {count > 0 ? (
        <View
          style={[
            styles.badge,
            {
              minWidth: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              top: -1,
              right: -1,
            },
          ]}
        >
          <Text
            style={[styles.badgeText, { fontSize: badgeSize <= 14 ? 8 : 9, lineHeight: badgeSize <= 14 ? 10 : 11 }]}
            numberOfLines={1}
          >
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  badge: {
    position: 'absolute',
    backgroundColor: BADGE_RED,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
