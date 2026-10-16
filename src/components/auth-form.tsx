import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AuthFormProps = {
  mode: 'login' | 'register';
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === 'login';
  const title = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
  const submitLabel = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
  const switchQuestion = isLogin ? 'Nie masz konta?' : 'Masz już konto?';
  const switchLabel = isLogin ? 'Zarejestruj się' : 'Zaloguj się';
  const switchHref = isLogin ? '/register' : '/login';

  const validate = () => {
    if (!email.trim()) {
      return 'Podaj adres e-mail.';
    }
    if (!password) {
      return 'Podaj hasło.';
    }
    if (password.length < 6) {
      return 'Hasło musi mieć co najmniej 6 znaków.';
    }
    return null;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Coś poszło nie tak. Spróbuj ponownie.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.title}>
          {title}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.field}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            style={[styles.input, { color: theme.text }]}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.field}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Hasło"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            style={[styles.input, { color: theme.text }]}
          />
        </ThemedView>

        {error ? (
          <ThemedText style={[styles.error, styles.errorText]}>{error}</ThemedText>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            submitting && styles.buttonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText type="smallBold" style={styles.buttonText}>
              {submitLabel}
            </ThemedText>
          )}
        </Pressable>

        <View style={styles.switchRow}>
          <ThemedText themeColor="textSecondary">{switchQuestion}</ThemedText>
          <Link href={switchHref}>
            <ThemedText type="linkPrimary">{switchLabel}</ThemedText>
          </Link>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  title: {
    marginBottom: Spacing.five,
    textAlign: 'center',
  },
  field: {
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  input: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    marginBottom: Spacing.three,
    textAlign: 'center',
  },
  errorText: {
    color: '#d92d20',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});
