import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { GiftCard } from '@/components/gift-card';
import { Spacing } from '@/constants/theme';
import type { Gift } from '@/lib/gifts';

const GRID_GAP = Spacing.three;

function gridColumns(width: number): number {
  if (width >= 1040) return 4;
  if (width >= 720) return 3;
  if (width >= 480) return 2;
  return 1;
}

type GiftListProps = {
  gifts: Gift[];
  onReserve?: (gift: Gift) => void;
  reservingId?: string | null;
  onMarkPurchased?: (gift: Gift) => void;
  purchasingId?: string | null;
  ownReservedIds?: ReadonlySet<string>;
  onEdit?: (gift: Gift) => void;
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
  onEdit,
  onDelete,
  deletingId,
}: GiftListProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const activeConfirmingId =
    confirmingId && gifts.some((gift) => gift.id === confirmingId && gift.status === 'free')
      ? confirmingId
      : null;

  const availableWidth =
    containerWidth > 0 ? containerWidth : Math.max(windowWidth - Spacing.four * 2, 0);
  const columns = gridColumns(availableWidth);
  const cardWidth = Math.floor(
    columns > 1 ? (availableWidth - GRID_GAP * (columns - 1)) / columns : availableWidth,
  );

  const handleDelete = (gift: Gift) => {
    setConfirmingId(null);
    onDelete?.(gift);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setContainerWidth((current) => (current === width ? current : width));
  };

  return (
    <View style={styles.grid} onLayout={handleLayout}>
      {gifts.map((gift) => (
        <View key={gift.id} style={{ width: cardWidth }}>
          <GiftCard
            gift={gift}
            onReserve={onReserve}
            reservingId={reservingId}
            onMarkPurchased={onMarkPurchased}
            purchasingId={purchasingId}
            ownReservedIds={ownReservedIds}
            onEdit={onEdit}
            onDelete={onDelete}
            deletingId={deletingId}
            confirmingDelete={activeConfirmingId === gift.id}
            onRequestDelete={() => setConfirmingId(gift.id)}
            onConfirmDelete={() => handleDelete(gift)}
            onCancelDelete={() => setConfirmingId(null)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: GRID_GAP,
  },
});
