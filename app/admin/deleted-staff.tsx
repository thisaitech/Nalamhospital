import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { EmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useColorScheme } from '@/components/useColorScheme';

export default function DeletedStaffScreen() {
  const router = useRouter();
  const { deletedClinicEmployees, allClinics } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const clinicNameById = useMemo(
    () => new Map(allClinics.map((clinic) => [clinic.id, clinic.name])),
    [allClinics]
  );

  const sorted = useMemo(
    () =>
      [...deletedClinicEmployees].sort((a, b) =>
        (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')
      ),
    [deletedClinicEmployees]
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Deleted staff', headerBackTitle: 'Back' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Archived staff stay saved. Tap a card to view details.
        </Text>

        {sorted.length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No deleted staff.</Text>
          </Card>
        ) : (
          sorted.map((emp) => {
            const clinicLabel = emp.clinicName ?? clinicNameById.get(emp.clinicId) ?? emp.clinicId;
            return (
              <Card key={emp.employeeId} style={styles.card} noPadding>
                <Pressable
                  style={styles.cardInner}
                  onPress={() => router.push(`/admin/employee/${emp.employeeId}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${getEmployeeDisplayName(emp)} details`}
                >
                  <View style={styles.row}>
                    <EmployeeAvatar
                      firstName={emp.firstName}
                      lastName={emp.lastName}
                      avatar={emp.avatar}
                      employeeId={emp.employeeId}
                      size={42}
                      borderRadius={14}
                      borderWidth={0}
                      backgroundColor={colors.background}
                      textColor={colors.textMuted}
                      fontSize={14}
                    />
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.text }]}>
                        {getEmployeeDisplayName(emp)}
                      </Text>
                      <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        {emp.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {emp.position}
                      </Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {emp.employeeId} · {clinicLabel}
                      </Text>
                      {emp.deletedAt ? (
                        <Text style={[styles.deletedOn, { color: colors.danger }]}>
                          Deleted {format(parseISO(emp.deletedAt), 'MMM d, yyyy')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.chevron, { backgroundColor: colors.background }]}>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </View>
                </Pressable>
              </Card>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  hint: { fontSize: 13, fontWeight: '500', marginBottom: 14 },
  empty: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  card: { marginBottom: 10 },
  cardInner: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  deletedOn: { fontSize: 11, marginTop: 4, fontWeight: '700' },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
