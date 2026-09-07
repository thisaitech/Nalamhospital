import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO, subDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Link, type Href, useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestsNotificationIcon } from '@/components/notifications/RequestsNotificationIcon';
import { SectionHeader } from '@/components/ui/QuickAction';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { APP_NAME, LEAVE_TYPE_LABELS } from '@/constants/config';
import Colors from '@/constants/Colors';
import { verifyOfficeWifi } from '@/services/wifiService';
import { formatDisplayTime } from '@/utils/formatTime';
import {
  canContinueNextShift,
  getTodayAttendance,
  hasPunchedOutToday,
  isShiftOpen,
} from '@/utils/punchSessions';
import { getDoctorPresentUi } from '@/utils/doctorPresent';
import { useColorScheme } from '@/components/useColorScheme';

import { showAlert, showConfirm, showPunchOutChoice } from '@/utils/uiAlert';

const SHIFT_CHANGE_AMBER = {
  bg: '#FFFBEB',
  border: '#F59E0B',
  text: '#B45309',
  soft: '#FEF3C7',
};

const SHIFT_CHANGE_HERO = {
  start: '#059669',
  end: '#10B981',
  accent: '#059669',
};

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
    doContinueShift,
    doMark24HourPresent,
    sync24HourPresentMiss,
    peopleOnLeaveToday,
    upcomingShifts,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    cancelShiftChange,
    refreshData,
    checkShiftChangeDay,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [punchLoading, setPunchLoading] = useState(false);
  const [continueBlockedMsg, setContinueBlockedMsg] = useState<string | null>(null);
  const [todayIsShiftChange, setTodayIsShiftChange] = useState(false);
  const [presentMissedHighlight, setPresentMissedHighlight] = useState(false);

  const unreadAdminChat = useMemo(
    () => notifications.filter((n) => !n.read && (n.type === 'admin_chat' || !n.type)),
    [notifications]
  );
  const unreadShiftChange = useMemo(
    () => {
      if (employee?.is24HourDuty) return [];

      const cancelledDates = new Set(
        notifications
          .filter(
            (n) =>
              n.relatedDate &&
              (n.type === 'shift_change_cancel_approved' ||
                (n.type === 'shift_change_day' && n.cancelled))
          )
          .map((n) => n.relatedDate as string)
      );

      return notifications
        .filter(
          (n) =>
            (n.type === 'shift_change_day' || n.type === 'shift_assigned') &&
            !n.cancelled &&
            !(n.relatedDate && cancelledDates.has(n.relatedDate)) &&
            (!n.read || n.cancelRequestedAt)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [notifications, employee?.is24HourDuty]
  );
  const shiftChangeNotice = unreadShiftChange[0] ?? null;
  const shiftChangeCancelled = Boolean(shiftChangeNotice?.cancelled);
  const shiftChangeCancelPending = Boolean(
    shiftChangeNotice?.cancelRequestedAt && !shiftChangeNotice?.cancelled
  );

  const shiftChangeCancelConfirmed = useMemo(() => {
    if (employee?.is24HourDuty) return null;
    return (
      notifications
        .filter(
          (n) =>
            !n.read &&
            (n.type === 'shift_change_cancel_approved' ||
              n.type === 'shift_change_cancelled' ||
              (n.type === 'shift_change_day' && n.cancelled))
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }, [notifications, employee?.is24HourDuty]);

  const shiftChangeCancelConfirmedMessage = useMemo(() => {
    if (!shiftChangeCancelConfirmed) return '';
    const dateKey = shiftChangeCancelConfirmed.relatedDate;
    if (!dateKey) {
      return 'Your shift change day is cancelled. You are now on your normal shift.';
    }
    const dateLabel = format(parseISO(dateKey), 'EEEE, MMM d');
    return `Your shift change day (${dateLabel}) is cancelled. You are now on your normal shift.`;
  }, [shiftChangeCancelConfirmed]);
  const adminChatCount = unreadAdminChat.length;

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (employee?.is24HourDuty) {
          await sync24HourPresentMiss();
        }
        await refreshData();
        if (employee && !employee.is24HourDuty) {
          try {
            const changeDay = await checkShiftChangeDay(format(new Date(), 'yyyy-MM-dd'));
            setTodayIsShiftChange(changeDay);
          } catch {
            setTodayIsShiftChange(false);
          }
        } else {
          setTodayIsShiftChange(false);
        }
      })();
    }, [employee, employee?.is24HourDuty, refreshData, sync24HourPresentMiss, checkShiftChangeDay])
  );

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const today = getTodayAttendance(attendance, todayKey);
  const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const openOvernight = useMemo(() => {
    const prior = attendance.find((r) => r.date === yesterdayKey && isShiftOpen(r));
    if (!prior) return null;
    return prior;
  }, [attendance, yesterdayKey]);

  const activePunch = today && isShiftOpen(today) ? today : openOvernight;
  const canFirstPunchIn = Boolean(!openOvernight && today && !today.punchIn);
  const canPunchOut = Boolean(activePunch && isShiftOpen(activePunch));
  const canContinue = canContinueNextShift(attendance, todayKey) && !openOvernight;
  const showPunchOutChoiceOnTap = canPunchOut && canContinue && !openOvernight;
  const punchedOutToday = hasPunchedOutToday(attendance, todayKey) && !openOvernight;
  /** Keep Continue visible after punch-out; tap then shows a red alert. */
  const showContinueButton = (canContinue || punchedOutToday) && !openOvernight;

  const doctorPresentUi = useMemo(
    () => getDoctorPresentUi({ employee, today }),
    [employee, today]
  );
  const is24HourDoctorHome = doctorPresentUi.mode !== 'none';

  const todayAssignment = useMemo(
    () => upcomingShifts.find((s) => s.date === todayKey) ?? null,
    [upcomingShifts, todayKey]
  );

  /** Green punch card only while this staff member still has an active shift change today. */
  const staffShiftChangeActiveToday = useMemo(() => {
    if (!todayIsShiftChange || is24HourDoctorHome) return false;

    const notes = todayAssignment?.notes?.toLowerCase() ?? '';
    const assignmentRestored =
      notes.includes('cancelled') || notes.includes('restored');
    const assignmentIsChange = todayAssignment?.notes?.startsWith('Changed:') ?? false;

    const staffCancelledToday = notifications.some(
      (n) =>
        n.relatedDate === todayKey &&
        (n.type === 'shift_change_cancel_approved' ||
          (n.type === 'shift_change_day' &&
            (n.cancelled || n.cancelRequestedAt)))
    );
    const adminCancelledToday = notifications.some(
      (n) => n.type === 'shift_change_cancelled' && n.relatedDate === todayKey
    );

    if (staffCancelledToday || adminCancelledToday || assignmentRestored) {
      return false;
    }

    return assignmentIsChange;
  }, [
    todayIsShiftChange,
    is24HourDoctorHome,
    todayAssignment,
    notifications,
    todayKey,
  ]);

  const shiftChangeNoticeForToday =
    shiftChangeNotice?.relatedDate === todayKey ||
    (!shiftChangeNotice?.relatedDate && todayIsShiftChange);

  const isShiftChangeBanner =
    !employee?.is24HourDuty &&
    shiftChangeNotice?.type === 'shift_change_day' &&
    !shiftChangeCancelled &&
    !shiftChangeCancelPending &&
    (shiftChangeNoticeForToday ? staffShiftChangeActiveToday : true);

  const canCancelShiftChange =
    !employee?.is24HourDuty &&
    shiftChangeNotice?.type === 'shift_change_day' &&
    !shiftChangeCancelled &&
    !shiftChangeCancelPending;

  const showPresentMissedBanner =
    is24HourDoctorHome && doctorPresentUi.mode === 'missed';
  const presentWindowLabel =
    doctorPresentUi.mode !== 'none'
      ? `${formatDisplayTime(doctorPresentUi.start)} – ${formatDisplayTime(doctorPresentUi.end)}`
      : '';

  useEffect(() => {
    if (!showPresentMissedBanner) {
      setPresentMissedHighlight(false);
    }
  }, [showPresentMissedBanner]);

  const heroShiftChange = staffShiftChangeActiveToday;
  const heroGradient: [string, string] = heroShiftChange
    ? [SHIFT_CHANGE_HERO.start, SHIFT_CHANGE_HERO.end]
    : [colors.gradientStart, colors.gradientEnd];
  const heroBtnColor = heroShiftChange ? SHIFT_CHANGE_HERO.accent : colors.primary;

  const punchStatus = is24HourDoctorHome
    ? doctorPresentUi.mode === 'marked'
      ? 'Present'
      : doctorPresentUi.mode === 'missed'
        ? 'Absent'
        : doctorPresentUi.mode === 'available'
          ? 'Mark present'
          : 'Waiting'
    : activePunch && isShiftOpen(activePunch)
    ? openOvernight
      ? 'Overnight'
      : today?.continuePunchIn
        ? 'Continued'
        : 'Active'
    : today?.punchOut
      ? canContinue
        ? 'Ready'
        : 'Done'
      : 'Away';

  const todayShiftKind = useMemo((): 'day' | 'night' | '24h' => {
    if (employee?.is24HourDuty) return '24h';
    const todayAssignment = upcomingShifts.find((s) => s.date === todayKey);
    if (todayAssignment?.shiftType === 'night') return 'night';
    if (todayAssignment?.shiftType === 'day') return 'day';
    if (employee?.nightShiftEnabled && !employee.dayShiftEnabled) return 'night';
    return 'day';
  }, [employee, upcomingShifts, todayKey]);

  const todayShiftTimingLabel = useMemo(() => {
    const assigned = upcomingShifts.find((s) => s.date === todayKey);
    const shiftChangeCancelledToday = notifications.some(
      (n) =>
        n.relatedDate === todayKey &&
        (n.type === 'shift_change_cancel_approved' ||
          (n.type === 'shift_change_day' && n.cancelled))
    );
    const assignmentRestored =
      assigned?.notes?.toLowerCase().includes('cancelled') ||
      assigned?.notes?.toLowerCase().includes('restored');

    if (shiftChangeCancelledToday || assignmentRestored) {
      if (!employee) return null;
      if (employee.is24HourDuty) {
        return `${employee.dayShiftStart || '08:00'}–${employee.dayShiftEnd || '08:00'}`;
      }
      if (employee.nightShiftEnabled && !employee.dayShiftEnabled) {
        return `${employee.nightShiftStart || '20:00'}–${employee.nightShiftEnd || '08:00'}`;
      }
      return `${employee.dayShiftStart || '08:00'}–${employee.dayShiftEnd || '20:00'}`;
    }

    if (assigned?.startTime && assigned?.endTime) {
      return `${assigned.startTime}–${assigned.endTime}`;
    }
    if (!employee) return null;
    if (employee.is24HourDuty) {
      return `${employee.dayShiftStart || '08:00'}–${employee.dayShiftEnd || '08:00'}`;
    }
    if (employee.nightShiftEnabled && !employee.dayShiftEnabled) {
      return `${employee.nightShiftStart || '20:00'}–${employee.nightShiftEnd || '08:00'}`;
    }
    return `${employee.dayShiftStart || '08:00'}–${employee.dayShiftEnd || '20:00'}`;
  }, [employee, upcomingShifts, todayKey, notifications]);

  const punchButtonTitle = punchLoading
    ? 'Please wait...'
    : is24HourDoctorHome
      ? doctorPresentUi.mode === 'available'
        ? 'Present'
        : doctorPresentUi.mode === 'marked'
          ? 'Present'
          : 'Present'
      : canPunchOut
      ? openOvernight
        ? 'Punch Out (overnight)'
        : today?.continuePunchIn
          ? 'Punch Out'
          : 'Punch Out'
      : canFirstPunchIn
        ? 'Punch In Now'
        : 'Done for today';

  const heroHint = is24HourDoctorHome
    ? doctorPresentUi.mode === 'available'
      ? `Mark Present between ${doctorPresentUi.start}–${doctorPresentUi.end}`
      : doctorPresentUi.mode === 'marked'
        ? 'Present marked for today'
        : doctorPresentUi.mode === 'missed'
          ? 'Present window missed'
          : `Present opens at ${doctorPresentUi.start}`
    : canPunchOut
    ? openOvernight
      ? 'Finish yesterday’s overnight / change-day shift'
      : today?.continuePunchIn
        ? 'Continued shift in progress — tap Punch Out to finish'
        : 'Tap Punch Out — choose Continue or Punch Out'
    : canFirstPunchIn
      ? 'Tap below to punch in'
      : 'Attendance completed for today';

  const performPunchOut = async () => {
    setPunchLoading(true);
    try {
      const result = await verifyOfficeWifi();
      const method = result.valid ? 'wifi' : 'manual';
      const record = await doPunchOut(method);
      if (record) {
        showPunchAlert(
          'Punched Out',
          `Recorded at ${formatDisplayTime(record.punchOut)}${record.hoursWorked ? ` · ${record.hoursWorked}h total attended` : ''}`
        );
      }
    } catch (e) {
      showPunchAlert('Error', e instanceof Error ? e.message : 'Punch out failed');
    } finally {
      setPunchLoading(false);
    }
  };

  const handleHeroPunch = async () => {
    if (punchLoading) return;

    if (is24HourDoctorHome) {
      if (doctorPresentUi.mode === 'missed') {
        setPresentMissedHighlight(true);
        return;
      }
      if (doctorPresentUi.mode !== 'available') return;
      setPunchLoading(true);
      try {
        const record = await doMark24HourPresent();
        if (record) {
          showPunchAlert('Present', 'You are marked present for today.');
        }
      } catch (e) {
        showPunchAlert('Error', e instanceof Error ? e.message : 'Could not mark present');
      } finally {
        setPunchLoading(false);
      }
      return;
    }

    if (canFirstPunchIn) {
      setPunchLoading(true);
      try {
        const result = await verifyOfficeWifi();
        const record = result.valid
          ? await doPunchIn('wifi', result.ssid)
          : await doPunchIn('manual', null);
        if (record) {
          if (record.locationApprovalStatus === 'pending') {
            showPunchAlert(
              'Punched In',
              `Outside clinic — waiting for admin approval. Recorded at ${formatDisplayTime(record.punchIn)}`
            );
          } else if (record.punchInLocationStatus === 'in_clinic') {
            showPunchAlert(
              'Punched In',
              `In clinic · ${formatDisplayTime(record.punchIn)}${
                record.punchInDistanceMeters != null ? ` · ${record.punchInDistanceMeters} m from center` : ''
              }`
            );
          } else if (record.manualApprovalStatus === 'pending') {
            showPunchAlert(
              'Punched In',
              `Manual punch — waiting for admin approval. Recorded at ${formatDisplayTime(record.punchIn)}`
            );
          } else {
            showPunchAlert('Punched In', `Recorded at ${formatDisplayTime(record.punchIn)}`);
          }
        }
      } catch (e) {
        showPunchAlert('Error', e instanceof Error ? e.message : 'Punch in failed');
      } finally {
        setPunchLoading(false);
      }
      return;
    }

    if (canPunchOut) {
      if (showPunchOutChoiceOnTap) {
        showPunchOutChoice(handleContinue, performPunchOut);
        return;
      }
      await performPunchOut();
    }
  };

  const handleContinue = async () => {
    if (punchLoading) return;
    if (punchedOutToday) {
      setContinueBlockedMsg('You already punched out');
      showAlert('You already punched out', 'Continue is not available after punch out.');
      return;
    }
    if (!canContinue) return;
    setContinueBlockedMsg(null);
    setPunchLoading(true);
    try {
      const result = await verifyOfficeWifi();
      const record = result.valid
        ? await doContinueShift('wifi', result.ssid)
        : await doContinueShift('manual', null);
      if (record) {
        showPunchAlert(
          'Next shift started',
          `Continued at ${formatDisplayTime(record.continuePunchIn)}. Hours so far are saved — continue again for another shift, or punch out when finished.`
        );
      }
    } catch (e) {
      showPunchAlert('Error', e instanceof Error ? e.message : 'Could not continue to next shift');
    } finally {
      setPunchLoading(false);
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
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/notifications' as Href)}
            style={({ pressed }) => [styles.notifBtn, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Requests"
          >
            <RequestsNotificationIcon count={unreadNotificationCount} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile' as Href)}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Ionicons name="person-outline" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.iconBtn,
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
          </Pressable>
        </View>
      </View>

      {showPresentMissedBanner ? (
        <View
          style={[
            styles.presentMissedBanner,
            {
              backgroundColor: colors.dangerLight,
              borderColor: colors.danger,
              borderWidth: presentMissedHighlight ? 2 : 1,
            },
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={[styles.presentMissedText, { color: colors.danger }]}>
            Please contact admin.{'\n'}
            Mark attendance between {presentWindowLabel}.
          </Text>
        </View>
      ) : null}

      {employee ? (
        <View style={styles.greetingBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.staffName, { color: colors.text }]} numberOfLines={1}>
              {employee.firstName} {employee.lastName}
            </Text>
            {todayShiftTimingLabel ? (
              <Text style={[styles.todayShiftTime, { color: colors.primary }]} numberOfLines={1}>
                {todayShiftTimingLabel}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.staffRole, { color: colors.textSecondary }]} numberOfLines={1}>
            {employee.position}
          </Text>
        </View>
      ) : null}

      <Card noPadding style={styles.heroCard}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
          pointerEvents="box-none"
        >
          <View style={styles.heroTop} pointerEvents="box-none">
            <View>
              <Text style={styles.heroLabel}>
                {heroShiftChange
                  ? "Today's attendance · Shift change"
                  : "Today's attendance"}
              </Text>
              <Text style={styles.heroStatus}>{punchStatus}</Text>
              {is24HourDoctorHome ? (
                <Text style={styles.heroTime}>
                  {doctorPresentUi.mode === 'marked' && today?.punchIn
                    ? `Present at ${formatDisplayTime(today.punchIn)}`
                    : heroHint}
                </Text>
              ) : activePunch && isShiftOpen(activePunch) ? (
                <Text style={styles.heroTime}>
                  {formatDisplayTime(activePunch.punchIn)}
                  {activePunch.continuePunchIn
                    ? ` · continued ${formatDisplayTime(activePunch.continuePunchIn)}`
                    : openOvernight
                      ? ' · overnight still open'
                      : ' · still working'}
                </Text>
              ) : today?.punchOut ? (
                <Text style={styles.heroTime}>
                  {formatDisplayTime(today.punchIn)} → {formatDisplayTime(today.punchOut)}
                  {today.hoursWorked > 0 ? ` · ${today.hoursWorked}h` : ''}
                </Text>
              ) : (
                <Text style={styles.heroTime}>{heroHint}</Text>
              )}
            </View>
            <View style={styles.shiftLogoWrap} accessibilityLabel={`${todayShiftKind} shift`}>
              {todayShiftKind === 'night' ? (
                <Ionicons name="moon" size={30} color="#FFFFFF" />
              ) : todayShiftKind === '24h' ? (
                <Text style={styles.shift24Label}>24h</Text>
              ) : (
                <Ionicons name="sunny" size={32} color="#FFFFFF" />
              )}
            </View>
          </View>
          {is24HourDoctorHome ? (
            doctorPresentUi.mode === 'available' ||
            doctorPresentUi.mode === 'marked' ||
            doctorPresentUi.mode === 'missed' ? (
              <Pressable
                onPress={handleHeroPunch}
                disabled={punchLoading || doctorPresentUi.mode === 'marked'}
                style={({ pressed }) => [
                  styles.heroBtn,
                  {
                    opacity:
                      punchLoading || doctorPresentUi.mode === 'marked'
                        ? 0.7
                        : pressed
                          ? 0.88
                          : 1,
                    transform: [
                      {
                        scale:
                          pressed &&
                          !punchLoading &&
                          doctorPresentUi.mode !== 'marked'
                            ? 0.98
                            : 1,
                      },
                    ],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Present"
              >
                <Text style={[styles.heroBtnText, { color: colors.primary }]}>
                  {punchLoading ? 'Please wait...' : 'Present'}
                </Text>
              </Pressable>
            ) : null
          ) : (
            <>
              <Pressable
                onPress={handleHeroPunch}
                disabled={punchLoading || (!canFirstPunchIn && !canPunchOut)}
                style={({ pressed }) => [
                  styles.heroBtn,
                  {
                    opacity: punchLoading || (!canFirstPunchIn && !canPunchOut) ? 0.7 : pressed ? 0.88 : 1,
                    transform: [
                      {
                        scale:
                          pressed && !punchLoading && (canFirstPunchIn || canPunchOut) ? 0.98 : 1,
                      },
                    ],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={punchButtonTitle}
              >
                <Text style={[styles.heroBtnText, { color: heroBtnColor }]}>{punchButtonTitle}</Text>
              </Pressable>
              {continueBlockedMsg ? (
                <Text style={styles.punchedOutAlert}>{continueBlockedMsg}</Text>
              ) : null}
              {showContinueButton ? (
                <Pressable
                  onPress={handleContinue}
                  disabled={punchLoading}
                  style={({ pressed }) => [
                    styles.continueBtn,
                    {
                      borderColor: 'rgba(255,255,255,0.55)',
                      opacity: punchLoading ? 0.7 : pressed ? 0.88 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to next shift"
                >
                  <Text style={styles.continueBtnText}>Continue</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </LinearGradient>
      </Card>

      {adminChatCount > 0 ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/notifications',
              params: { id: unreadAdminChat[0]?.id ?? '' },
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
              {adminChatCount} new message{adminChatCount === 1 ? '' : 's'} from admin
            </Text>
          </View>
          <Text style={[styles.noticeBody, { color: colors.text }]} numberOfLines={2}>
            {unreadAdminChat[0]?.body ?? 'Tap to read'}
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

      {shiftChangeCancelConfirmed ? (
        <View
          style={{
            ...styles.noticeBanner,
            backgroundColor: colors.borderLight,
            borderColor: colors.border,
          }}
        >
          <Pressable
            onPress={async () => {
              await markNotificationAsRead(shiftChangeCancelConfirmed.id);
              router.push({
                pathname: '/notifications',
                params: { id: shiftChangeCancelConfirmed.id },
              } as Href);
            }}
            accessibilityRole="button"
            accessibilityLabel="Shift change cancellation confirmed"
          >
            <View style={styles.noticeHeader}>
              <Ionicons name="checkmark-circle" size={18} color={colors.textSecondary} />
              <Text style={[styles.noticeTitle, { color: colors.text }]}>
                Normal shift restored
              </Text>
            </View>
            <Text style={[styles.noticeBody, { color: colors.textSecondary }]}>
              {shiftChangeCancelConfirmedMessage}
            </Text>
          </Pressable>
        </View>
      ) : shiftChangeNotice ? (
        <View
          style={{
            ...styles.noticeBanner,
            backgroundColor: isShiftChangeBanner ? SHIFT_CHANGE_AMBER.bg : colors.successLight,
            borderColor: isShiftChangeBanner ? SHIFT_CHANGE_AMBER.border : colors.success,
          }}
        >
          <Pressable
            onPress={async () => {
              await markNotificationAsRead(shiftChangeNotice.id);
              router.push({
                pathname: '/notifications',
                params: { id: shiftChangeNotice.id },
              } as Href);
            }}
            accessibilityRole="button"
            accessibilityLabel="Shift change notification"
          >
            <View style={styles.noticeHeader}>
              <Ionicons
                name="swap-horizontal"
                size={18}
                color={isShiftChangeBanner ? SHIFT_CHANGE_AMBER.text : colors.success}
              />
              <Text
                style={[
                  styles.noticeTitle,
                  { color: isShiftChangeBanner ? SHIFT_CHANGE_AMBER.text : colors.success },
                ]}
              >
                {shiftChangeNotice.title}
              </Text>
            </View>
            <Text style={[styles.noticeBody, { color: colors.text }]} numberOfLines={3}>
              {shiftChangeNotice.body}
            </Text>
          </Pressable>
          {(canCancelShiftChange || shiftChangeCancelled || shiftChangeCancelPending) ? (
          <View style={styles.noticeActions}>
            {shiftChangeCancelled ? (
              <View
                style={[
                  styles.cancelShiftBtn,
                  {
                    borderColor: colors.textMuted,
                    backgroundColor: colors.borderLight,
                  },
                ]}
                accessibilityLabel="Shift change cancelled"
              >
                <Text style={[styles.cancelShiftBtnText, { color: colors.textMuted }]}>
                  Cancelled
                </Text>
              </View>
            ) : shiftChangeCancelPending ? (
              <View
                style={[
                  styles.cancelShiftBtn,
                  {
                    borderColor: colors.warning,
                    backgroundColor: colors.warningLight,
                  },
                ]}
                accessibilityLabel="Shift change cancel pending admin review"
              >
                <Text style={[styles.cancelShiftBtnText, { color: colors.warning }]}>
                  Cancel pending
                </Text>
              </View>
            ) : canCancelShiftChange ? (
              <Pressable
                onPress={async () => {
                  const ok = await showConfirm(
                    'Cancel shift change',
                    'Cancel this shift change and restore your regular shift timing? Admin will review your request.'
                  );
                  if (!ok) return;
                  try {
                    await cancelShiftChange(shiftChangeNotice.id);
                    showAlert(
                      'Request sent',
                      'Your regular shift timing is restored. Admin will review your cancellation request.'
                    );
                  } catch (e) {
                    showAlert('Error', e instanceof Error ? e.message : 'Could not cancel');
                  }
                }}
                style={({ pressed }) => [
                  styles.cancelShiftBtn,
                  {
                    borderColor: colors.danger,
                    backgroundColor: colors.card,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel shift change"
              >
                <Text style={[styles.cancelShiftBtnText, { color: colors.danger }]}>
                  Cancel change
                </Text>
              </Pressable>
            ) : null}
          </View>
          ) : null}
        </View>
      ) : null}

      <SectionHeader title="Upcoming shifts" />
      {upcomingShifts.length === 0 ? (
        <Card style={styles.historyCard}>
          <Text style={[styles.historyDetail, { color: colors.textSecondary }]}>No upcoming shifts assigned.</Text>
        </Card>
      ) : (
        upcomingShifts.slice(0, 3).map((shift) => {
          const isChangeDayShift =
            staffShiftChangeActiveToday &&
            shift.date === todayKey &&
            !employee?.is24HourDuty;
          return (
            <Card
              key={shift.id}
              style={[
                styles.historyCard,
                isChangeDayShift
                  ? {
                      backgroundColor: SHIFT_CHANGE_AMBER.bg,
                      borderWidth: 1,
                      borderColor: SHIFT_CHANGE_AMBER.border,
                    }
                  : null,
              ]}
            >
              <View style={styles.shiftChangeRow}>
                <Text
                  style={[
                    styles.historyDate,
                    { color: isChangeDayShift ? SHIFT_CHANGE_AMBER.text : colors.text, flex: 1 },
                  ]}
                >
                  {format(parseISO(shift.date), 'EEE, MMM d')} · {shift.shiftType.toUpperCase()}
                </Text>
                {isChangeDayShift ? (
                  <View style={styles.shiftChangePill}>
                    <Text style={styles.shiftChangePillText}>Shift change</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.historyDetail,
                  { color: isChangeDayShift ? SHIFT_CHANGE_AMBER.text : colors.textSecondary },
                ]}
              >
                {shift.startTime} – {shift.endTime}
              </Text>
            </Card>
          );
        })
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  greetingBlock: { marginBottom: 20 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  staffName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, flex: 1 },
  todayShiftTime: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  staffRole: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  heroCard: { marginBottom: 16 },
  gradient: { padding: 20, borderRadius: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shiftLogoWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shift24Label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
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
  continueBtn: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  continueBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  punchedOutAlert: {
    marginTop: 12,
    marginBottom: 2,
    textAlign: 'center',
    color: '#FECACA',
    fontSize: 13,
    fontWeight: '800',
  },
  presentMissedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  presentMissedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  noticeBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noticeTitle: { fontSize: 13, fontWeight: '800', flex: 1 },
  noticeBody: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  noticeActions: { marginTop: 12 },
  cancelShiftBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  cancelShiftBtnText: { fontSize: 13, fontWeight: '700' },
  quickLinks: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickBtn: { flex: 1 },
  historyCard: { marginBottom: 10, paddingVertical: 14, paddingHorizontal: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyBody: { flex: 1 },
  historyDate: { fontSize: 15, fontWeight: '700' },
  historyDetail: { fontSize: 12, marginTop: 3, fontWeight: '500' },
  shiftChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftChangePill: {
    backgroundColor: SHIFT_CHANGE_AMBER.soft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shiftChangePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: SHIFT_CHANGE_AMBER.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
