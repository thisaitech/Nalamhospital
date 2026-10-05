import type React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform } from 'react-native';

export type AppSymbolName =
  | React.ComponentProps<typeof SymbolView>['name']
  | { ios: string; android: keyof typeof MaterialIcons.glyphMap; web: string };

type AppSymbolProps = {
  name: AppSymbolName;
  tintColor: string;
  size: number;
};

function androidIconName(name: AppSymbolName): keyof typeof MaterialIcons.glyphMap {
  if (typeof name === 'object' && name !== null && 'android' in name) {
    return name.android;
  }
  return 'help-outline';
}

/** Uses Material Icons on Android release builds (expo-symbols can crash on some devices). */
export function AppSymbol({ name, tintColor, size }: AppSymbolProps) {
  if (Platform.OS === 'android') {
    return <MaterialIcons name={androidIconName(name)} color={tintColor} size={size} />;
  }
  return (
    <SymbolView
      name={name as React.ComponentProps<typeof SymbolView>['name']}
      tintColor={tintColor}
      size={size}
    />
  );
}
