'use client';

// Voice or text — the demo's only stateful shell. Unmounting the inactive
// panel is deliberate: each one hangs up its own call on unmount, so switching
// modes can never leave a call running in a hidden component.

import { useState } from 'react';

import { CallPanel } from '@/components/call-panel';
import { ChatPanel } from '@/components/chat-panel';

type Mode = 'audio' | 'text';

export function ModeSwitch() {
  const [mode, setMode] = useState<Mode>('audio');

  return (
    <>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'audio'}
          className={mode === 'audio' ? 'tab active' : 'tab'}
          onClick={() => setMode('audio')}
        >
          Voice call
        </button>
        <button
          role="tab"
          aria-selected={mode === 'text'}
          className={mode === 'text' ? 'tab active' : 'tab'}
          onClick={() => setMode('text')}
        >
          Text chat
        </button>
      </div>

      <p className="lede">
        {mode === 'audio'
          ? 'Speech both ways over WebRTC. Your server is not on the media path.'
          : 'The same agent — same prompt, same tools, same pathway — as a typed conversation. No microphone, no speech recognition, no synthesis.'}
      </p>

      {mode === 'audio' ? <CallPanel /> : <ChatPanel />}
    </>
  );
}
