import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type AuthFormProps = {
  mode: 'login' | 'register';
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasValidationError, setHasValidationError] = useState(false);

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
      setHasValidationError(true);
      return;
    }
    setError(null);
    setHasValidationError(false);
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Coś poszło nie tak. Spróbuj ponownie.';
      setError(message);
      setHasValidationError(false);
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

        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="E-mail"
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          invalid={hasValidationError}
          errorId="auth-error"
          style={{ marginBottom: Spacing.three }}
        />

        <TextField
          value={password}
          onChangeText={setPassword}
          placeholder="Hasło"
          secureTextEntry
          autoCapitalize="none"
          invalid={hasValidationError}
          errorId="auth-error"
          style={{ marginBottom: Spacing.three }}
        />

        {error ? (
          <View style={styles.errorWrapper}>
            <FormError nativeID="auth-error">{error}</FormError>
          </View>
        ) : null}

        <Button label={submitLabel} onPress={handleSubmit} loading={submitting} />

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
  errorWrapper: {
    marginBottom: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});
