import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type GiftPlaceholderProps = {
  size?: number;
};

export function GiftPlaceholder({ size = 88 }: GiftPlaceholderProps) {
  const theme = useTheme();
  const scale = size / 88;

  const area = (width: number, height: number, top: number): ViewStyle => ({
    position: 'absolute',
    left: (size - width * scale) / 2,
    top: top * scale,
    width: width * scale,
    height: height * scale,
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          area(24, 16, 8),
          {
            borderRadius: 8 * scale,
            backgroundColor: theme.imagePlaceholder,
            transform: [{ translateX: -10 * scale }],
          },
        ]}
      />
      <View
        style={[
          area(24, 16, 8),
          {
            borderRadius: 8 * scale,
            backgroundColor: theme.imagePlaceholder,
            transform: [{ translateX: 10 * scale }],
          },
        ]}
      />
      <View
        style={[
          area(52, 11, 26),
          { borderRadius: 4 * scale, backgroundColor: theme.imagePlaceholderAccent },
        ]}
      />
      <View
        style={[
          area(46, 36, 37),
          { borderRadius: 5 * scale, backgroundColor: theme.imagePlaceholder },
        ]}
      />
      <View
        style={[
          area(7, 44, 29),
          { borderRadius: 2 * scale, backgroundColor: theme.imageBackground },
        ]}
      />
      <View
        style={[
          area(52, 7, 28),
          { borderRadius: 2 * scale, backgroundColor: theme.imageBackground },
        ]}
      />
      <View
        style={[
          area(12, 12, 20),
          { borderRadius: 4 * scale, backgroundColor: theme.imagePlaceholder },
        ]}
      />
    </View>
  );
}
