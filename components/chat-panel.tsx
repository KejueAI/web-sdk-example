'use client';

// The entire browser side of a Sonus TEXT call.
//
// Compare it with call-panel.tsx: same credential flow, same transcript
// rendering, same tool events — because it is the same agent. What is missing
// is everything to do with audio: no microphone permission, no mute, no track
// to attach, no autoplay gesture to satisfy.

import { useCallback, useEffect, useRef, useState } from 'react';

import { SonusTextCall } from '@kejue/sonus-web';
import type { TextAgentState, ToolActivity, TranscriptLine } from '@kejue/sonus-web';

// `disconnected` is both "never started" and "finished", so the copy for it
// depends on whether this chat has ever been live — otherwise a fresh page
// greets you with "Chat ended".
const STATE_COPY: Record<TextAgentState, string> = {
  disconnected: 'Chat ended',
  connecting: 'Connecting…',
  initializing: 'Getting ready…',
  idle: 'Ready',
  thinking: 'Thinking…',
  replying: 'Replying…',
};

export function ChatPanel() {
  const chatRef = useRef<SonusTextCall | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [state, setState] = useState<TextAgentState>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [draft, setDraft] = useState('');
  // The reply currently being written, assembled from `delta` events. Cleared
  // when the authoritative transcript catches up.
  const [streaming, setStreaming] = useState('');
  const [callId, setCallId] = useState<string>();
  const [error, setError] = useState<string>();

  const start = useCallback(async () => {
    setStarting(true);
    setError(undefined);
    setTranscript([]);
    setTools([]);
    setStreaming('');

    try {
      const chat = await SonusTextCall.start({
        // A FUNCTION, not a value — it runs at connect time, so the token is
        // always freshly minted rather than one that expired in a variable.
        credentials: async () => {
          const res = await fetch('/api/start-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modality: 'text' }),
          });
          if (!res.ok) throw new Error(await res.text());
          return res.json();
        },
      });

      chatRef.current = chat;
      setCallId(chat.callId);
      setLive(true);
      setState(chat.state);

      // idle | thinking | replying — the text vocabulary. There is no
      // "listening" or "speaking" here, because there is no microphone and no
      // synthesis to describe.
      chat.on('stateChange', setState);

      // THE SOURCE OF TRUTH. The whole conversation, republished whenever it
      // changes. Render this.
      chat.on('transcriptUpdate', (lines) => {
        setTranscript(lines);
        // The committed reply has landed, so the streaming draft it was
        // building is now redundant.
        setStreaming('');
      });

      // An accelerator, not a second source of truth: chunks of the reply as
      // it is written, so it types out live. Ignoring this event entirely
      // would still be correct — just less lively.
      chat.on('delta', ({ text }) => setStreaming((prev) => prev + text));
      chat.on('replyEnd', () => setStreaming(''));

      // Same as a voice call: name and status only. Arguments and outputs are
      // withheld unless you pass includeToolPayloads — they are raw responses
      // from your own backend and this runs in an end user's browser.
      chat.on('tool', (t) => setTools((prev) => [...prev, t]));

      chat.on('error', (e) => setError(e.message));

      chat.on('disconnected', () => {
        setLive(false);
        setState('disconnected');
        setStreaming('');
        chatRef.current = null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const send = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const chat = chatRef.current;
      const body = draft.trim();
      if (!chat || !body) return;
      setDraft('');
      try {
        await chat.send(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setDraft(body); // hand it back rather than losing what they typed
      }
    },
    [draft],
  );

  const hangup = useCallback(async () => {
    await chatRef.current?.hangup();
  }, []);

  // A chat left open is a CALL left open — it bills minutes for as long as it
  // is connected, exactly like a voice call. Never leave one behind a closed
  // tab.
  useEffect(() => () => void chatRef.current?.hangup(), []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [transcript, streaming]);

  return (
    <div className="panel">
      <div className="row">
        {!live ? (
          <button onClick={start} disabled={starting} className="primary">
            {starting ? 'Connecting…' : 'Start chat'}
          </button>
        ) : (
          <button onClick={hangup} className="danger">
            End chat
          </button>
        )}
        <span className={`status status-${state}`}>
          {state === 'disconnected' && !callId ? 'Not started' : STATE_COPY[state]}
        </span>
      </div>

      {callId && (
        <p className="meta">
          call_id <code>{callId}</code> — usable now against{' '}
          <code>GET /v1/calls/{'{id}'}</code>
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="feed" ref={feedRef}>
        {transcript.length === 0 && !streaming ? (
          <p className="empty">
            {live ? 'Waiting for the agent to open…' : 'Not connected.'}
          </p>
        ) : (
          <ul className="messages">
            {transcript.map((line, i) => (
              <li key={i} className={line.role}>
                {line.text}
              </li>
            ))}
            {streaming && (
              <li className="agent streaming">
                {streaming}
                <span className="caret" />
              </li>
            )}
          </ul>
        )}
      </div>

      <form className="composer" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={live ? 'Type a message…' : 'Start the chat first'}
          disabled={!live}
          maxLength={4000}
          autoFocus
        />
        <button type="submit" className="primary" disabled={!live || !draft.trim()}>
          Send
        </button>
      </form>

      {tools.length > 0 && (
        <>
          <h2>Tool activity</h2>
          <ul className="tools">
            {tools.map((t, i) => (
              <li key={i}>
                <code>{t.name}</code> <span className={`tool-${t.status}`}>{t.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
