import React from 'react';
import { useRouter } from 'expo-router';

export default function BuddyRunnerMessagesHubFallback() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/buddyrunner/messages_list');
  }, [router]);
  return null;
}


