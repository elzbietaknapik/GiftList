import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createList,
  getMyList,
  ListAlreadyExistsError,
  type GiftList,
} from '@/lib/lists';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function AppIndexScreen() {
  const theme = useTheme();
  const { user } = useSession();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<GiftList | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getMyList(userId)
      .then((data) => {
        if (active) setList(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Nie udało się pobrać listy.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleCreate = async () => {
    if (!user || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Podaj nazwę listy.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await createList(user.id, trimmed);
      setList(created);
      setName('');
    } catch (e) {
      if (e instanceof ListAlreadyExistsError) {
        const existing = await getMyList(user.id);
        setList(existing);
      } else {
        setError(e instanceof Error ? e.message : 'Nie udało się zapisać listy.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    void supabase.auth.signOut();
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          {list ? list.name : 'Twoja lista'}
        </ThemedText>
        <Pressable onPress={handleSignOut} hitSlop={Spacing.two}>
          <ThemedText type="linkPrimary">Wyloguj</ThemedText>
        </Pressable>
      </View>

      {list ? (
        <View style={styles.emptyState}>
          <ThemedText type="default">Twoja lista jest jeszcze pusta.</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
            Dodawanie prezentów w kolejnym kroku.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.form}>
          <ThemedText themeColor="textSecondary">
            Utwórz swoją pierwszą listę prezentową.
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.field}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nazwa listy"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="sentences"
              style={[styles.input, { color: theme.text }]}
            />
          </ThemedView>

          {error ? (
            <ThemedText style={[styles.error, styles.errorText]}>{error}</ThemedText>
          ) : null}

          <Pressable
            onPress={handleCreate}
            disabled={saving}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              saving && styles.buttonDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.buttonText}>
                Zapisz
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.five,
  },
  headerTitle: {
    flexShrink: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    borderRadius: Spacing.two,
  },
  input: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
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
});
