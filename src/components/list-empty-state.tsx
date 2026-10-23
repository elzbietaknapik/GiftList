import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function ListEmptyState() {
  return (
    <View style={styles.emptyState}>
      <ThemedText type="default">Nie dodano jeszcze prezentów.</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
        Dodaj pierwszy prezent w formularzu powyżej.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
  },
});
