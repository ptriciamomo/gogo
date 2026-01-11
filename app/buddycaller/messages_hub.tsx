import React from 'react';
import { useRouter } from 'expo-router';

export default function BuddyCallerMessagesHubFallback() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/buddycaller/messages_list');
  }, [router]);
  return null;
}


