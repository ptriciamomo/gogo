// Web-specific entry for ChatScreenRunner
// IMPORTANT: Avoid circular import by explicitly referencing the .tsx file.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - explicit .tsx extension avoids platform resolution loop on web
import ChatScreenRunner from './ChatScreenRunner.tsx';

export default function ChatScreenRunnerWeb() {
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', width: '100%', transform: 'scale(0.80)', transformOrigin: 'top center', height: '100vh', overflowY: 'auto' }}>
      <ChatScreenRunner />
    </div>
  );
}


