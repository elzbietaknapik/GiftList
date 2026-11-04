import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddGiftForm } from '@/components/add-gift-form';
import { CreateListForm } from '@/components/create-list-form';
import { EditGiftForm } from '@/components/edit-gift-form';
import { GiftList } from '@/components/gift-list';
import { ListEmptyState } from '@/components/list-empty-state';
import { ShareLinkCard } from '@/components/share-link-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormError } from '@/components/ui/form-error';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteGift, GiftNotDeletableError, listGifts, type Gift } from '@/lib/gifts';
import { deleteList, getMyList, ListHasReservationsError, type GiftList as GiftListModel } from '@/lib/lists';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [giftDeleteError, setGiftDeleteError] = useState<string | null>(null);
  const [pendingDeleteListId, setPendingDeleteListId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState(false);
  const [listDeleteError, setListDeleteError] = useState<string | null>(null);
  const [editingGift, setEditingGift] = useState<Gift | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const confirmingListDelete = list !== null && pendingDeleteListId === list.id;

  useEffect(() => {
    if (editingGift) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [editingGift]);

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

  const handleDeleteList = async () => {
    if (!list) return;
    setDeletingList(true);
    setListDeleteError(null);
    try {
      await deleteList(list.id);
      setList(null);
      setGifts([]);
      setEditingGift(null);
      setPendingDeleteListId(null);
    } catch (e) {
      if (e instanceof ListHasReservationsError) {
        setListDeleteError(e.message);
      } else {
        setListDeleteError(e instanceof Error ? e.message : 'Nie udało się usunąć listy.');
      }
    } finally {
      setDeletingList(false);
    }
  };

  const handleCancelListDelete = () => {
    setPendingDeleteListId(null);
    setListDeleteError(null);
  };

  const handleDeleteGift = async (gift: Gift) => {
    if (!list) return;
    setDeletingId(gift.id);
    setGiftDeleteError(null);
    try {
      await deleteGift(gift.id);
      const data = await listGifts(list.id);
      setGifts(data);
      setEditingGift((current) => (current?.id === gift.id ? null : current));
    } catch (e) {
      if (e instanceof GiftNotDeletableError) {
        setGiftDeleteError(e.message);
      } else {
        setGiftDeleteError(e instanceof Error ? e.message : 'Nie udało się usunąć prezentu.');
      }
    } finally {
      setDeletingId(null);
    }
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
        <View style={styles.headerActions}>
          {list ? (
            confirmingListDelete ? (
              <>
                <Pressable onPress={handleDeleteList} disabled={deletingList} hitSlop={Spacing.two}>
                  <ThemedText type="linkPrimary">{deletingList ? 'Usuwanie…' : 'Potwierdź'}</ThemedText>
                </Pressable>
                <Pressable onPress={handleCancelListDelete} disabled={deletingList} hitSlop={Spacing.two}>
                  <ThemedText type="link">Anuluj</ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => setPendingDeleteListId(list.id)} hitSlop={Spacing.two}>
                <ThemedText type="link" themeColor="destructive">
                  Usuń listę
                </ThemedText>
              </Pressable>
            )
          ) : null}
          <Pressable onPress={handleSignOut} hitSlop={Spacing.two}>
            <ThemedText type="linkPrimary">Wyloguj</ThemedText>
          </Pressable>
        </View>
      </View>

      {listDeleteError ? <FormError>{listDeleteError}</FormError> : null}

      {giftDeleteError ? <FormError>{giftDeleteError}</FormError> : null}

      {error ? <FormError>{error}</FormError> : null}

      {list ? (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ShareLinkCard shareToken={list.share_token} />
          {editingGift ? (
            <EditGiftForm
              key={editingGift.id}
              gift={editingGift}
              onSaved={(updated) => {
                setGifts((prev) => prev.map((gift) => (gift.id === updated.id ? updated : gift)));
                setEditingGift(null);
              }}
              onCancel={() => setEditingGift(null)}
            />
          ) : (
            <AddGiftForm listId={list.id} onAdded={(gift) => setGifts((prev) => [...prev, gift])} />
          )}
          {giftsLoading ? (
            <ActivityIndicator color={theme.primary} />
          ) : gifts.length === 0 ? (
            <ListEmptyState />
          ) : (
            <GiftList
              gifts={gifts}
              onEdit={setEditingGift}
              onDelete={handleDeleteGift}
              deletingId={deletingId}
            />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
