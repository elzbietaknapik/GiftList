import { useState } from 'react';
import { Share, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Radius, Spacing } from '@/constants/theme';
import { buildShareUrl } from '@/lib/share-link';

type ShareLinkCardProps = {
  shareToken: string;
};

export function ShareLinkCard({ shareToken }: ShareLinkCardProps) {
  const [shareError, setShareError] = useState<string | null>(null);
  const url = buildShareUrl(shareToken);

  const handleShare = async () => {
    setShareError(null);
    try {
      await Share.share({ message: url });
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Nie udało się udostępnić linku.');
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="default">Link do udostępnienia</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" selectable>
        {url}
      </ThemedText>
      {shareError ? <FormError>{shareError}</FormError> : null}
      <Button label="Udostępnij" onPress={handleShare} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.small,
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
