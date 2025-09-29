// Web-specific entry for ChatScreenCaller
// IMPORTANT: Avoid circular import by explicitly referencing the .tsx file.
// The bundler prefers .web first; using the explicit extension points to the base file.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - explicit .tsx extension avoids platform resolution loop on web
import ChatScreenCaller from './ChatScreenCaller.tsx';

export default function ChatScreenCallerWeb() {
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', width: '100%', transform: 'scale(0.80)', transformOrigin: 'top center', height: '100vh', overflowY: 'auto' }}>
      <ChatScreenCaller />
    </div>
  );
}


