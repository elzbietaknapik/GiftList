import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { GiftList } from '@/components/gift-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormError } from '@/components/ui/form-error';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GiftAlreadyReservedError, listGifts, reserveGift, type Gift } from '@/lib/gifts';
import { openSharedList, type SharedGiftList } from '@/lib/lists';
import { useSession } from '@/lib/session';
import { isShareToken } from '@/lib/share-link';

export default function SharedListScreen() {
  const theme = useTheme();
  const { user } = useSession();
  const params = useLocalSearchParams<{ token: string }>();
  const token = params.token ?? '';
  const valid = isShareToken(token);
  const [loading, setLoading] = useState(valid);
  const [list, setList] = useState<SharedGiftList | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [error, setError] = useState<string | null>(valid ? null : 'Nieprawidłowy link.');
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState(token);

  if (activeToken !== token) {
    setActiveToken(token);
    setList(null);
    setGifts([]);
    setLoading(valid);
    setError(valid ? null : 'Nieprawidłowy link.');
    setReservingId(null);
    setReserveError(null);
  }

  useEffect(() => {
    if (!valid) return;
    let active = true;
    openSharedList(token)
      .then(async (data) => {
        if (!active) return;
        setList(data);
        const giftData = await listGifts(data.id);
        if (active) setGifts(giftData);
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
  }, [token, valid]);

  const canReserve = list !== null && list.owner_id !== user?.id;

  async function handleReserve(gift: Gift) {
    if (!list) return;
    setReservingId(gift.id);
    setReserveError(null);
    try {
      await reserveGift(gift.id);
      setGifts(await listGifts(list.id));
    } catch (e) {
      const alreadyReserved = e instanceof GiftAlreadyReservedError;
      setReserveError(
        alreadyReserved
          ? 'Ten prezent został już zarezerwowany.'
          : e instanceof Error
            ? e.message
            : 'Nie udało się zarezerwować prezentu.',
      );
      if (alreadyReserved) {
        try {
          setGifts(await listGifts(list.id));
        } catch {
          return;
        }
      }
    } finally {
      setReservingId(null);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {list ? (
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            {list.name}
          </ThemedText>
        </View>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      {reserveError ? <FormError>{reserveError}</FormError> : null}

      {list ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {gifts.length === 0 ? (
            <ThemedText>Ta lista nie ma jeszcze prezentów.</ThemedText>
          ) : (
            <GiftList
              gifts={gifts}
              onReserve={canReserve ? handleReserve : undefined}
              reservingId={reservingId}
            />
          )}
        </ScrollView>
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
