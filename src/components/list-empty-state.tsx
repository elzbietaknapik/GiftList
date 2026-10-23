import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function ListEmptyState() {
  return (
    <View style={styles.emptyState}>
      <ThemedText type="default">Twoja lista jest jeszcze pusta.</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
        Dodawanie prezentów w kolejnym kroku.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
  },
});
