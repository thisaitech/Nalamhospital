import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { MOBILE_WEB_MAX_WIDTH } from '@/constants/mobileWeb';
import type { UserRole } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';

/** Matches Nalam Clinic banner maroon so status-bar area has no gaps. */
const BANNER_MAROON = '#8B0018';
/** Approx aspect ratio of the banner artwork (width / height). */
const BANNER_ASPECT = 2.55;

type AuthMode = 'signin' | 'register';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, login, register, isAdmin } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [role, setRole] = useState<UserRole>('employee');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldsReady, setFieldsReady] = useState(Platform.OS !== 'web');
  const { width: screenWidth } = useWindowDimensions();
  const layoutWidth = Platform.OS === 'web' ? Math.min(screenWidth, MOBILE_WEB_MAX_WIDTH) : screenWidth;
  const bannerBodyHeight = Math.max(120, Math.round(layoutWidth / BANNER_ASPECT));

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }, [mode]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      setEmail('');
      setPassword('');
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const enableFields = () => {
    if (!fieldsReady) setFieldsReady(true);
  };

  const clearCredentialFields = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const switchRole = (next: UserRole) => {
    setRole(next);
    setConfirmPassword('');
    setError('');
    clearCredentialFields();
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFieldsReady(Platform.OS !== 'web');
    clearCredentialFields();
    if (next === 'signin') {
      setRole('employee');
    } else {
      setRole('employee');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={isAdmin ? '/admin' : '/(tabs)'} />;
  }

  const handleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password, role);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.banner, { backgroundColor: BANNER_MAROON }]}>
        <View style={{ height: insets.top, backgroundColor: BANNER_MAROON }} />
        <Image
          source={require('@/assets/images/nalam-clinic-logo.png')}
          style={[styles.bannerImage, { width: layoutWidth, height: bannerBodyHeight }]}
          resizeMode="stretch"
          accessibilityLabel="Nalam Clinic"
        />
      </View>

      <KeyboardAvoidingView style={styles.formArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.pageTagline, { color: colors.textSecondary }]}>
            Clinic attendance, leave & payroll
          </Text>
          <Card style={styles.form}>
            <Text style={[styles.formTitle, { color: colors.text }]}>
              {isRegister ? 'Create account' : 'Sign in'}
            </Text>
            <Text style={[styles.formSub, { color: colors.textSecondary }]}>
              {isRegister ? 'Register as a new employee' : 'Choose your access type'}
            </Text>

            {!isRegister ? (
              <View style={styles.roleRow}>
                {(['employee', 'admin'] as UserRole[]).map((item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.roleChip,
                      {
                        backgroundColor: role === item ? colors.primaryLight : colors.background,
                        borderColor: role === item ? colors.primary : colors.borderLight,
                      },
                    ]}
                    onPress={() => switchRole(item)}
                  >
                    <Text style={[styles.roleText, { color: role === item ? colors.primary : colors.textSecondary }]}>
                      {item === 'employee' ? 'Doctor / Staff' : 'Admin'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {isRegister ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>FIRST NAME</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.background }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  placeholder="John"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={[styles.label, { color: colors.textMuted }]}>LAST NAME</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.background }]}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  placeholder="Doe"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            ) : null}

            <Text style={[styles.label, { color: colors.textMuted }]}>EMAIL</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.autofillTrap} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <TextInput autoComplete="username" textContentType="username" style={styles.hiddenInput} />
                <TextInput autoComplete="current-password" secureTextEntry style={styles.hiddenInput} />
              </View>
            ) : null}
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.background }]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete={isRegister ? 'email' : 'off'}
              textContentType="none"
              importantForAutofill="no"
              readOnly={!fieldsReady}
              onFocus={enableFields}
              keyboardType="email-address"
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>PASSWORD</Text>
            <PasswordField
              value={password}
              onChangeText={setPassword}
              visible={showPassword}
              onToggleVisible={() => setShowPassword((prev) => !prev)}
              colors={colors}
              autoComplete={isRegister ? 'new-password' : 'new-password'}
              readOnly={!fieldsReady}
              onFocus={enableFields}
            />

            {isRegister ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>CONFIRM PASSWORD</Text>
                <PasswordField
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggleVisible={() => setShowConfirmPassword((prev) => !prev)}
                  colors={colors}
                  autoComplete="new-password"
                  readOnly={!fieldsReady}
                  onFocus={enableFields}
                />
              </>
            ) : null}

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Button
              title={isRegister ? 'Create Account' : 'Sign In'}
              onPress={isRegister ? handleRegister : handleSignIn}
              loading={submitting}
              size="lg"
              style={styles.button}
            />

            <Pressable onPress={() => switchMode(isRegister ? 'signin' : 'register')} style={styles.switchMode}>
              <Text style={[styles.switchModeText, { color: colors.primary }]}>
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </Text>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PasswordField({
  value,
  onChangeText,
  visible,
  onToggleVisible,
  colors,
  autoComplete = 'new-password',
  readOnly = false,
  onFocus,
}: {
  value: string;
  onChangeText: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  colors: (typeof Colors)['light'];
  autoComplete?: 'off' | 'new-password' | 'password';
  readOnly?: boolean;
  onFocus?: () => void;
}) {
  return (
    <View
      style={[
        styles.passwordWrap,
        { borderColor: colors.borderLight, backgroundColor: colors.background },
      ]}
    >
      <TextInput
        style={[styles.passwordInput, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        placeholder="••••••••"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType="none"
        importantForAutofill="no"
        readOnly={readOnly}
        onFocus={onFocus}
      />
      <Pressable
        onPress={onToggleVisible}
        hitSlop={8}
        style={styles.eyeBtn}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    width: '100%',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
  },
  pageTagline: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  formArea: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  form: { padding: 24 },
  formTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  formSub: { fontSize: 14, marginTop: 4, marginBottom: 16, fontWeight: '500' },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleChip: { flex: 1, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  roleText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: 14, letterSpacing: 0.8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '500' },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { marginTop: 12, fontSize: 14, fontWeight: '500' },
  button: { marginTop: 24 },
  switchMode: { marginTop: 16, alignItems: 'center', paddingVertical: 4 },
  switchModeText: { fontSize: 14, fontWeight: '700' },
  autofillTrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenInput: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
