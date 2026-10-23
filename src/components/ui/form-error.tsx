import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type FormErrorProps = {
  children: ReactNode;
  nativeID?: string;
};

export function FormError({ children, nativeID }: FormErrorProps) {
  return (
    <ThemedText
      type="small"
      themeColor="destructive"
      accessibilityLiveRegion="polite"
      nativeID={nativeID}
      style={styles.error}
    >
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  error: {
    textAlign: 'center',
  },
});
