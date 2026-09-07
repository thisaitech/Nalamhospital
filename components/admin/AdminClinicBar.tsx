import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildClinicFilterOptions } from '@/utils/clinicScope';

type Props = {
  style?: StyleProp<ViewStyle>;
  hideLabel?: boolean;
};

export function AdminClinicBar({ style, hideLabel = false }: Props) {
  const { allClinics, selectedClinicId, setSelectedClinicId } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const options = useMemo(() => buildClinicFilterOptions(allClinics), [allClinics]);

  if (allClinics.length === 0) return null;

  return (
    <View style={[styles.bar, style]}>
      <SelectField
        label={hideLabel ? '' : 'Viewing clinic'}
        value={selectedClinicId}
        onChange={(value) => {
          void setSelectedClinicId(value);
        }}
        options={options}
        compact
        hideLeadingIcon
        placeholder="Viewing clinic"
        textColor={colors.text}
        mutedColor={colors.textMuted}
        borderColor={colors.borderLight}
        cardColor={colors.card}
        dangerColor={colors.danger}
        primaryColor={colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    minWidth: 0,
  },
});
