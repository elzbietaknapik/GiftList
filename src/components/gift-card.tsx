import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { GiftPlaceholder } from '@/components/gift-placeholder';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Gift, GiftStatus } from '@/lib/gifts';

type StatusMeta = {
  label: string;
  background: ThemeColor;
  text: ThemeColor;
  ring: ThemeColor;
};

const STATUS_META: Record<GiftStatus, StatusMeta> = {
  free: {
    label: 'Wolny',
    background: 'statusFreeBackground',
    text: 'statusFreeText',
    ring: 'statusFreeRing',
  },
  reserved: {
    label: 'Zarezerwowany',
    background: 'statusReservedBackground',
    text: 'statusReservedText',
    ring: 'statusReservedRing',
  },
  purchased: {
    label: 'Zrealizowany',
    background: 'statusPurchasedBackground',
    text: 'statusPurchasedText',
    ring: 'statusPurchasedRing',
  },
};

const HTTP_URL_PATTERN = /^https?:\/\//i;

function formatPrice(price: number): string {
  return `${price.toFixed(2).replace('.', ',')} zł`;
}

async function openGiftLink(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await openBrowserAsync(url);
}

type GiftImageProps = {
  uri: string | null;
  name: string;
};

function GiftImage({ uri, name }: GiftImageProps) {
  const [failed, setFailed] = useState(false);
  const source = uri?.trim() ?? '';
  const canLoad = !failed && HTTP_URL_PATTERN.test(source);

  if (!canLoad) {
    return <GiftPlaceholder />;
  }

  return (
    <Image
      source={{ uri: source }}
      style={styles.image}
      contentFit="contain"
      transition={150}
      onError={() => setFailed(true)}
      accessibilityLabel={`Zdjęcie prezentu: ${name}`}
      accessibilityIgnoresInvertColors
    />
  );
}

export type GiftCardProps = {
  gift: Gift;
  onReserve?: (gift: Gift) => void;
  reservingId?: string | null;
  onMarkPurchased?: (gift: Gift) => void;
  purchasingId?: string | null;
  ownReservedIds?: ReadonlySet<string>;
  onEdit?: (gift: Gift) => void;
  onDelete?: (gift: Gift) => void;
  deletingId?: string | null;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

export function GiftCard({
  gift,
  onReserve,
  reservingId,
  onMarkPurchased,
  purchasingId,
  ownReservedIds,
  onEdit,
  onDelete,
  deletingId = null,
  confirmingDelete,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: GiftCardProps) {
  const theme = useTheme();
  const meta = STATUS_META[gift.status];
  const imageKey = gift.image_url?.trim() ?? '';

  const link = gift.link.trim();
  const hasLink = HTTP_URL_PATTERN.test(link);
  const handleOpenLink = () => {
    void openGiftLink(link).catch(() => {});
  };

  const canReserve = gift.status === 'free' && onReserve !== undefined;
  const canMarkPurchased =
    gift.status === 'reserved' && onMarkPurchased !== undefined && ownReservedIds?.has(gift.id);
  const canEdit = gift.status === 'free' && onEdit !== undefined;
  const canDelete = gift.status === 'free' && onDelete !== undefined;

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <Pressable
        onPress={hasLink ? handleOpenLink : undefined}
        disabled={!hasLink}
        accessibilityRole={hasLink ? 'link' : undefined}
        accessibilityLabel={hasLink ? `Otwórz ${gift.name} w sklepie` : undefined}
        style={[styles.imageArea, { backgroundColor: theme.imageBackground }]}
      >
        <GiftImage key={imageKey || 'placeholder'} uri={gift.image_url} name={gift.name} />
      </Pressable>

      <View pointerEvents="box-none" style={styles.topRight}>
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            { backgroundColor: theme[meta.background], borderColor: theme[meta.ring] },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: theme[meta.text] }]} />
          <ThemedText type="smallBold" themeColor={meta.text}>
            {meta.label}
          </ThemedText>
        </View>

        {confirmingDelete ? null : (
          <>
            {canEdit ? (
              <IconButton
                icon={Pencil}
                label={`Edytuj prezent: ${gift.name}`}
                disabled={deletingId !== null}
                onPress={() => onEdit?.(gift)}
              />
            ) : null}
            {canDelete ? (
              <IconButton
                icon={Trash2}
                label={`Usuń prezent: ${gift.name}`}
                tone="destructive"
                loading={deletingId === gift.id}
                disabled={deletingId !== null}
                onPress={onRequestDelete}
              />
            ) : null}
          </>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="default" style={styles.name} numberOfLines={2}>
            {gift.name}
          </ThemedText>
          {hasLink ? (
            <Pressable
              onPress={handleOpenLink}
              hitSlop={Spacing.two}
              accessibilityRole="link"
              accessibilityLabel={`Otwórz link do prezentu: ${gift.name}`}
              style={({ pressed }) => [
                styles.linkButton,
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText themeColor="primary" style={styles.linkGlyph}>
                ↗
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <ThemedText type="default" style={styles.price}>
          {formatPrice(gift.price)}
        </ThemedText>

        {canReserve || canMarkPurchased ? (
          <View style={styles.actions}>
            {canReserve ? (
              <Button
                label="Zarezerwuj"
                accessibilityLabel={`Zarezerwuj ${gift.name}`}
                loading={reservingId === gift.id}
                disabled={reservingId !== null}
                onPress={() => onReserve?.(gift)}
              />
            ) : null}
            {canMarkPurchased ? (
              <Button
                label="Oznacz jako kupiony"
                accessibilityLabel={`Oznacz jako kupiony: ${gift.name}`}
                loading={purchasingId === gift.id}
                disabled={purchasingId !== null}
                onPress={() => onMarkPurchased?.(gift)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {confirmingDelete ? (
        <View
          style={[styles.deleteOverlay, { backgroundColor: theme.background, borderColor: theme.border }]}
        >
          <ThemedText type="default" style={styles.deleteQuestion}>
            Czy na pewno chcesz usunąć ten prezent?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {gift.name}
          </ThemedText>
          <View style={styles.deleteActions}>
            <Button
              label="Potwierdź"
              variant="destructive"
              accessibilityLabel={`Potwierdź usunięcie: ${gift.name}`}
              loading={deletingId === gift.id}
              disabled={deletingId !== null && deletingId !== gift.id}
              onPress={onConfirmDelete}
              style={styles.deleteAction}
            />
            <Button
              label="Anuluj"
              accessibilityLabel={`Anuluj usuwanie: ${gift.name}`}
              disabled={deletingId !== null}
              onPress={onCancelDelete}
              style={styles.deleteAction}
            />
          </View>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  imageArea: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topRight: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.pill,
  },
  body: {
    flexGrow: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    fontWeight: '700',
  },
  linkButton: {
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
  linkGlyph: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  price: {
    fontWeight: '700',
  },
  actions: {
    marginTop: 'auto',
    gap: Spacing.two,
  },
  deleteOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    borderWidth: 1,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  deleteQuestion: {
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
    marginTop: Spacing.two,
  },
  deleteAction: {
    flex: 1,
  },
});
