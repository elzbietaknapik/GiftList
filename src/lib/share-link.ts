import * as Linking from 'expo-linking';

const SHARE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildShareUrl(shareToken: string): string {
  return `giftlist://list/${shareToken}`;
}

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(value);
}

export function parseShareToken(url: string): string | null {
  const { hostname, path } = Linking.parse(url);
  if (hostname !== 'list' || !path || !isShareToken(path)) {
    return null;
  }
  return path;
}
