import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddGiftForm } from '@/components/add-gift-form';
import { CreateListForm } from '@/components/create-list-form';
import { GiftList } from '@/components/gift-list';
import { ListEmptyState } from '@/components/list-empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormError } from '@/components/ui/form-error';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listGifts, type Gift } from '@/lib/gifts';
import { getMyList, type GiftList as GiftListModel } from '@/lib/lists';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function AppIndexScreen() {
  const theme = useTheme();
  const { user } = useSession();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<GiftListModel | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const listId = list?.id;

  useEffect(() => {
    if (!listId) return;
    let active = true;
    listGifts(listId)
      .then((data) => {
        if (active) setGifts(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Nie udało się pobrać prezentów.');
      })
      .finally(() => {
        if (active) setGiftsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listId]);

  const handleSignOut = () => {
    void supabase.auth.signOut();
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
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

      {error ? <FormError>{error}</FormError> : null}

      {list ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AddGiftForm listId={list.id} onAdded={(gift) => setGifts((prev) => [...prev, gift])} />
          {giftsLoading ? (
            <ActivityIndicator color={theme.primary} />
          ) : gifts.length === 0 ? (
            <ListEmptyState />
          ) : (
            <GiftList gifts={gifts} />
          )}
        </ScrollView>
      ) : user ? (
        <CreateListForm userId={user.id} onCreated={setList} />
      ) : null}
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
  scroll: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
