import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  loading,
  disabled,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: theme.primary, borderRadius: Radius.small, paddingVertical: Spacing.three },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        { borderColor: focused ? theme.ring : 'transparent' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.onPrimary} />
      ) : (
        <ThemedText themeColor="onPrimary">{label}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: 2,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
