'use client';

// The entire browser side of a Sonus web call.
//
// Note what is NOT here: no API key, no agent id, no Sonus URL. The browser
// gets a token from our own /api/start-call and nothing else. Audio flows
// directly between this page and Sonus over WebRTC.

import { useCallback, useEffect, useRef, useState } from 'react';

import { SonusWebCall } from '@kejue/sonus-web';
import type { AudioAgentState, ToolActivity, TranscriptLine } from '@kejue/sonus-web';

const STATE_COPY: Record<AudioAgentState, string> = {
  disconnected: 'Call ended',
  connecting: 'Connecting…',
  initializing: 'Getting ready…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
};

export function CallPanel() {
  const callRef = useRef<SonusWebCall | null>(null);

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [state, setState] = useState<AudioAgentState>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [muted, setMuted] = useState(false);
  const [callId, setCallId] = useState<string>();
  const [error, setError] = useState<string>();

  const start = useCallback(async () => {
    setStarting(true);
    setError(undefined);
    setTranscript([]);
    setTools([]);

    try {
      const call = await SonusWebCall.start({
        // A FUNCTION, not a value. It runs at connect time, so the token is
        // always freshly minted — one that has been sitting in a variable may
        // already have expired.
        credentials: async () => {
          const res = await fetch('/api/start-call', { method: 'POST' });
          if (!res.ok) throw new Error(await res.text());
          return res.json();
        },
      });

      callRef.current = call;

      setCallId(call.callId);
      setLive(true);
      setState(call.state);

      // Drives a talking indicator. speaking / listening / thinking.
      call.on('stateChange', setState);

      // Fires with the FULL transcript each time it changes, so you can render
      // it directly. There is also a `transcript` event that fires once per
      // new line if you would rather append.
      call.on('transcriptUpdate', setTranscript);

      // Tool activity carries the tool NAME and status only. Arguments and
      // outputs are withheld unless you pass includeToolPayloads: true — they
      // are raw responses from your own backend and this runs in an end user's
      // browser. Name + status is enough to render "Checking your account…".
      call.on('tool', (t) => setTools((prev) => [...prev, t]));

      // The caller said something the agent could not make out.
      call.on('noise', () => {
        /* could show a "sorry, didn't catch that" hint */
      });

      call.on('error', (e) => setError(e.message));

      call.on('disconnected', () => {
        setLive(false);
        setState('disconnected');
        callRef.current = null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const hangup = useCallback(async () => {
    await callRef.current?.hangup();
  }, []);

  const toggleMute = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    await call.setMuted(!call.muted);
    setMuted(call.muted);
  }, []);

  // Never leave a call running behind a closed tab.
  useEffect(() => () => void callRef.current?.hangup(), []);

  return (
    <div className="panel">
      <div className="row">
        {!live ? (
          <button onClick={start} disabled={starting} className="primary">
            {starting ? 'Connecting…' : 'Start call'}
          </button>
        ) : (
          <>
            <button onClick={hangup} className="danger">
              Hang up
            </button>
            <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          </>
        )}
        <span className={`status status-${state}`}>{STATE_COPY[state]}</span>
      </div>

      {callId && (
        <p className="meta">
          call_id <code>{callId}</code> — usable now against{' '}
          <code>GET /v1/calls/{'{id}'}</code>
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <h2>Transcript</h2>
      {transcript.length === 0 ? (
        <p className="empty">Nothing yet. The agent speaks first.</p>
      ) : (
        <ul className="transcript">
          {transcript.map((line, i) => (
            <li key={i} className={line.role}>
              <span className="who">{line.role}</span>
              {line.text}
            </li>
          ))}
        </ul>
      )}

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
