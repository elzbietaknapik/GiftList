import { StyleSheet } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const handleSubmit = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.session) {
      throw new Error(
        'Konto utworzone. Potwierdź swój adres e-mail, aby się zalogować.',
      );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <AuthForm mode="register" onSubmit={handleSubmit} />
      <ThemedText themeColor="textSecondary" style={styles.note}>
        Rejestracja loguje Cię od razu, gdy potwierdzenia e-maila są wyłączone.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  note: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    textAlign: 'center',
  },
});
