import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO, subDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useMemo, useState } from 'react';

import { Link, type Href, useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProfileHeader } from '@/components/ui/ProfileHeader';
import { SectionHeader } from '@/components/ui/QuickAction';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { APP_NAME, LEAVE_TYPE_LABELS } from '@/constants/config';
import Colors from '@/constants/Colors';
import { verifyOfficeWifi } from '@/services/wifiService';
import { formatDisplayTime } from '@/utils/formatTime';
import { useColorScheme } from '@/components/useColorScheme';

function showPunchAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function DashboardScreen() {
  const router = useRouter();
  const {
    employee,
    attendance,
    logout,
    doPunchIn,
    doPunchOut,
    peopleOnLeaveToday,
    upcomingShifts,
    notifications,
    unreadNotificationCount,
    refreshData,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [punchLoading, setPunchLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const today = attendance[0];
  const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const openOvernight = useMemo(() => {
    const prior = attendance.find((r) => r.date === yesterdayKey && r.punchIn && !r.punchOut);
    if (!prior) return null;
    // Overnight / change-day windows end after midnight
    return prior;
  }, [attendance, yesterdayKey]);

  const activePunch = today?.punchIn && !today?.punchOut ? today : openOvernight;
  const canPunchIn = today && !today.punchIn && !openOvernight;
  const canPunchOut = Boolean(activePunch?.punchIn && !activePunch?.punchOut);
  const punchComplete = Boolean(today?.punchOut) && !openOvernight;

  const punchStatus = activePunch?.punchIn
    ? activePunch.punchOut
      ? 'Done'
      : openOvernight
        ? 'Overnight'
        : 'Active'
    : 'Away';
  const punchTone = activePunch?.punchIn
    ? activePunch.punchOut
      ? 'success'
      : 'primary'
    : 'warning';

  const punchButtonTitle = punchLoading
    ? 'Please wait...'
    : punchComplete
      ? 'Done for today'
      : canPunchOut
        ? openOvernight
          ? 'Punch Out (overnight)'
          : 'Punch Out'
        : 'Punch In Now';

  const heroHint = punchComplete
    ? 'Attendance completed for today'
    : canPunchOut
      ? openOvernight
        ? 'Finish yesterday’s overnight / change-day shift'
        : 'Tap below to punch out'
      : 'Tap below to punch in';

  const handleHeroPunch = async () => {
    if (punchLoading || punchComplete) return;

    if (canPunchIn) {
      setPunchLoading(true);
      try {
        const result = await verifyOfficeWifi();
        if (result.valid) {
          await doPunchIn('wifi', result.ssid);
        } else {
          await doPunchIn('manual', null);
        }
      } catch (e) {
        showPunchAlert('Error', e instanceof Error ? e.message : 'Punch in failed');
      } finally {
        setPunchLoading(false);
      }
      return;
    }

    if (canPunchOut) {
      setPunchLoading(true);
      try {
        const result = await verifyOfficeWifi();
        const method = result.valid ? 'wifi' : 'manual';
        const record = await doPunchOut(method);
        if (record) {
          showPunchAlert(
            'Punched Out',
            `Recorded at ${formatDisplayTime(record.punchOut)}${record.hoursWorked ? ` · ${record.hoursWorked}h worked` : ''}`
          );
        }
      } catch (e) {
        showPunchAlert('Error', e instanceof Error ? e.message : 'Punch out failed');
      } finally {
        setPunchLoading(false);
      }
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        logout();
      }
      return;
    }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Text style={[styles.appTitle, { color: colors.text }]}>{APP_NAME}</Text>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            {
              backgroundColor: colors.dangerLight,
              borderColor: colors.danger,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </View>

      {employee ? (
        <ProfileHeader
          firstName={employee.firstName}
          lastName={employee.lastName}
          position={employee.position}
          employeeId={employee.employeeId}
          avatar={employee.avatar}
        />
      ) : null}

      <Card noPadding style={styles.heroCard}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
          pointerEvents="box-none"
        >
          <View style={styles.heroTop} pointerEvents="box-none">
            <View>
              <Text style={styles.heroLabel}>Today's attendance</Text>
              <Text style={styles.heroStatus}>{punchStatus}</Text>
              {activePunch?.punchIn ? (
                <Text style={styles.heroTime}>
                  {formatDisplayTime(activePunch.punchIn)}
                  {activePunch.punchOut
                    ? ` → ${formatDisplayTime(activePunch.punchOut)}`
                    : openOvernight
                      ? ' · overnight still open'
                      : ' · still working'}
                </Text>
              ) : (
                <Text style={styles.heroTime}>{heroHint}</Text>
              )}
            </View>
            <StatusBadge label={punchStatus} tone={punchTone} light />
          </View>
          <Pressable
            onPress={handleHeroPunch}
            disabled={punchLoading || punchComplete}
            style={({ pressed }) => [
              styles.heroBtn,
              {
                opacity: punchLoading || punchComplete ? 0.7 : pressed ? 0.88 : 1,
                transform: [{ scale: pressed && !punchLoading && !punchComplete ? 0.98 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={punchButtonTitle}
          >
            <Text style={[styles.heroBtnText, { color: colors.primary }]}>{punchButtonTitle}</Text>
          </Pressable>
        </LinearGradient>
      </Card>

      {unreadNotificationCount > 0 ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/announcement',
              params: { id: notifications.find((n) => !n.read)?.id ?? '' },
            } as Href)
          }
          style={{
            ...styles.noticeBanner,
            backgroundColor: colors.primaryLight,
            borderColor: colors.primary,
          }}
        >
          <View style={styles.noticeHeader}>
            <Ionicons name="notifications" size={18} color={colors.primary} />
            <Text style={[styles.noticeTitle, { color: colors.primary }]}>
              {unreadNotificationCount} new message{unreadNotificationCount === 1 ? '' : 's'} from admin
            </Text>
          </View>
          <Text style={[styles.noticeBody, { color: colors.text }]} numberOfLines={2}>
            {notifications.find((n) => !n.read)?.body ?? 'Tap to read'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.quickLinks}>
        <Link href="/leave-request" asChild>
          <Button title="Request leave" variant="outline" style={styles.quickBtn} />
        </Link>
        <Link href="/(tabs)/attendance" asChild>
          <Button title="My attendance" variant="outline" style={styles.quickBtn} />
        </Link>
      </View>

      <SectionHeader title="Upcoming shifts" />
      {upcomingShifts.length === 0 ? (
        <Card style={styles.historyCard}>
          <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>No upcoming shifts assigned.</Text>
        </Card>
      ) : (
        upcomingShifts.slice(0, 3).map((shift) => (
          <Card key={shift.id} style={styles.historyCard}>
            <Text style={[styles.historyDate, { color: colors.text }]}>
              {format(parseISO(shift.date), 'EEE, MMM d')} · {shift.shiftType.toUpperCase()}
            </Text>
            <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>
              {shift.startTime} – {shift.endTime}
            </Text>
          </Card>
        ))
      )}

      <SectionHeader title="Who's on leave today" />
      {peopleOnLeaveToday.length === 0 ? (
        <Card style={styles.historyCard}>
          <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>Everyone is available today.</Text>
        </Card>
      ) : (
        peopleOnLeaveToday.map((person) => (
          <Card key={`${person.employeeId}-leave`} style={styles.historyCard}>
            <Text style={[styles.historyDate, { color: colors.text }]}>{person.employeeName}</Text>
            <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>
              {LEAVE_TYPE_LABELS[person.leaveType] ?? person.leaveType} · {person.department}
            </Text>
          </Card>
        ))
      )}

      <SectionHeader title="Recent activity" action={{ label: 'See all', href: '/(tabs)/attendance' }} />
      {attendance.slice(0, 4).map((record) => (
        <Card key={record.id} style={styles.historyCard}>
          <View style={styles.historyRow}>
            <View style={[styles.dateIcon, { backgroundColor: colors.primaryLight }]}>
              <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={colors.primary} size={14} />
            </View>
            <View style={styles.historyBody}>
              <Text style={[styles.historyDate, { color: colors.text }]}>
                {format(parseISO(record.date), 'EEE, MMM d')}
              </Text>
              <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>
                {record.punchIn
                  ? `${formatDisplayTime(record.punchIn)} – ${formatDisplayTime(record.punchOut)}`
                  : 'No punch recorded'}
                {record.hoursWorked > 0 ? ` · ${record.hoursWorked}h` : ''}
                {record.otHours > 0 ? ` · OT ${record.otHours}h` : ''}
              </Text>
            </View>
            <StatusBadge
              label={record.status}
              tone={record.status === 'present' ? 'success' : record.status === 'late' ? 'warning' : 'neutral'}
            />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  appTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoutText: { fontSize: 13, fontWeight: '700' },
  heroCard: { marginBottom: 16 },
  gradient: { padding: 20, borderRadius: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroStatus: { color: '#FFF', fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  heroTime: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, fontWeight: '500' },
  heroBtn: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  noticeBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noticeTitle: { fontSize: 13, fontWeight: '800', flex: 1 },
  noticeBody: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  quickLinks: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickBtn: { flex: 1 },
  historyCard: { marginBottom: 10, paddingVertical: 14, paddingHorizontal: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyBody: { flex: 1 },
  historyDate: { fontSize: 15, fontWeight: '700' },
  historyDetail: { fontSize: 12, marginTop: 3, fontWeight: '500' },
});
