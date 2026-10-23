import { useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  invalid?: boolean;
  errorId?: string;
  style?: StyleProp<ViewStyle>;
};

export function TextField({ invalid, errorId, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = invalid ? theme.destructive : focused ? theme.ring : 'transparent';

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.container, { borderColor }, style]}
    >
      <TextInput
        {...rest}
        aria-invalid={invalid}
        aria-describedby={errorId}
        placeholderTextColor={theme.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, { color: theme.text }]}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.small,
    borderWidth: 2,
  },
  input: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
