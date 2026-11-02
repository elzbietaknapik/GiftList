import { Href, router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useShareLink } from '@/lib/share-link-provider';

export default function AppLayout() {
  const { pendingToken, clearPendingToken } = useShareLink();

  useEffect(() => {
    if (!pendingToken) {
      return;
    }
    clearPendingToken();
    router.push({ pathname: '/list/[token]', params: { token: pendingToken } } as unknown as Href);
  }, [pendingToken, clearPendingToken]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
