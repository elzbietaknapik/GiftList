import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import type { Gift, GiftStatus } from '@/lib/gifts';

const STATUS_LABELS: Record<GiftStatus, string> = {
  free: 'Wolny',
  reserved: 'Zarezerwowany',
  purchased: 'Zrealizowany',
};

function formatPrice(price: number): string {
  return `${price.toFixed(2).replace('.', ',')} zł`;
}

type GiftListProps = {
  gifts: Gift[];
  onReserve?: (gift: Gift) => void;
  reservingId?: string | null;
};

export function GiftList({ gifts, onReserve, reservingId }: GiftListProps) {
  return (
    <View style={styles.list}>
      {gifts.map((gift) => (
        <ThemedView key={gift.id} type="backgroundElement" style={styles.row}>
          <View style={styles.rowHeader}>
            <ThemedText type="default" style={styles.name} numberOfLines={2}>
              {gift.name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{formatPrice(gift.price)}</ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">{STATUS_LABELS[gift.status]}</ThemedText>
          {gift.status === 'free' && onReserve ? (
            <Button
              label="Zarezerwuj"
              accessibilityLabel={`Zarezerwuj ${gift.name}`}
              loading={reservingId === gift.id}
              disabled={reservingId !== null}
              onPress={() => onReserve(gift)}
            />
          ) : null}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {gift.link}
          </ThemedText>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    borderRadius: Radius.small,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
});
