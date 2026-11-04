import { useState } from 'react';
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
  onMarkPurchased?: (gift: Gift) => void;
  purchasingId?: string | null;
  ownReservedIds?: ReadonlySet<string>;
  onDelete?: (gift: Gift) => void;
  deletingId?: string | null;
};

export function GiftList({
  gifts,
  onReserve,
  reservingId,
  onMarkPurchased,
  purchasingId,
  ownReservedIds,
  onDelete,
  deletingId,
}: GiftListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const activeConfirmingId =
    confirmingId && gifts.some((gift) => gift.id === confirmingId && gift.status === 'free')
      ? confirmingId
      : null;

  const handleDelete = (gift: Gift) => {
    setConfirmingId(null);
    onDelete?.(gift);
  };

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
          {gift.status === 'reserved' && onMarkPurchased && ownReservedIds?.has(gift.id) ? (
            <Button
              label="Oznacz jako kupiony"
              accessibilityLabel={`Oznacz jako kupiony: ${gift.name}`}
              loading={purchasingId === gift.id}
              disabled={purchasingId !== null}
              onPress={() => onMarkPurchased(gift)}
            />
          ) : null}
          {gift.status === 'free' && onDelete ? (
            activeConfirmingId === gift.id ? (
              <View style={styles.confirmRow}>
                <Button
                  label="Potwierdź"
                  variant="destructive"
                  accessibilityLabel={`Potwierdź usunięcie: ${gift.name}`}
                  loading={deletingId === gift.id}
                  disabled={deletingId !== null && deletingId !== gift.id}
                  onPress={() => handleDelete(gift)}
                  style={styles.confirmButton}
                />
                <Button
                  label="Anuluj"
                  onPress={() => setConfirmingId(null)}
                  style={styles.confirmButton}
                />
              </View>
            ) : (
              <Button
                label="Usuń"
                accessibilityLabel={`Usuń: ${gift.name}`}
                disabled={deletingId !== null}
                onPress={() => setConfirmingId(gift.id)}
              />
            )
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
  confirmRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmButton: {
    flex: 1,
  },
});
