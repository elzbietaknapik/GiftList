/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#2563eb',
    onPrimary: '#ffffff',
    destructive: '#d92d20',
    destructiveSurface: '#FFF1F2',
    ring: '#2563eb',
    border: '#E4E4E7',
    imageBackground: '#F4F4F5',
    imagePlaceholder: '#A1A1AA',
    imagePlaceholderAccent: '#D4D4D8',
    statusFreeBackground: '#ECFDF5',
    statusFreeText: '#047857',
    statusFreeRing: '#05966933',
    statusReservedBackground: '#FFF1F2',
    statusReservedText: '#BE123C',
    statusReservedRing: '#E11D4833',
    statusPurchasedBackground: '#EFF6FF',
    statusPurchasedText: '#1D4ED8',
    statusPurchasedRing: '#2563EB33',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#3c87f7',
    onPrimary: '#000000',
    destructive: '#f97066',
    destructiveSurface: '#4C0519',
    ring: '#3c87f7',
    border: '#2E3135',
    imageBackground: '#27272A',
    imagePlaceholder: '#52525B',
    imagePlaceholderAccent: '#3F3F46',
    statusFreeBackground: '#022C22',
    statusFreeText: '#34D399',
    statusFreeRing: '#34D39955',
    statusReservedBackground: '#4C0519',
    statusReservedText: '#FB7185',
    statusReservedRing: '#FB718555',
    statusPurchasedBackground: '#172554',
    statusPurchasedText: '#60A5FA',
    statusPurchasedRing: '#60A5FA55',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = {
  small: 8,
  medium: 12,
  pill: 999,
} as const;
