import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconButtonTone = 'neutral' | 'destructive';

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: IconButtonTone;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const ICON_SIZE = 16;

export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'neutral',
  loading,
  disabled,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;

  const iconColor = tone === 'destructive' ? theme.destructive : hovered ? theme.text : theme.textSecondary;
  const hoverBackground =
    tone === 'destructive' ? theme.destructiveSurface : theme.backgroundSelected;

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: Radius.small },
        (hovered || pressed) && !isDisabled && { backgroundColor: hoverBackground },
        focused && { borderColor: theme.ring },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <Icon color={iconColor} size={ICON_SIZE} strokeWidth={2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
});
