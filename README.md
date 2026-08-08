# Sonus web-call SDK test

A minimal Next.js app showing how a customer embeds a Sonus voice agent in
their own product. Two files carry the whole integration:

| File | Runs on | Role |
| --- | --- | --- |
| `app/api/start-call/route.ts` | your server | holds the API key, mints a token |
| `components/call-panel.tsx` | the browser | consumes the token, runs the call |

## How it fits together

```
your backend  --(API key)------->  POST /v1/web-calls
              <--(token, ws_url)--
your frontend --(token)---------->  wss://agent.sonus.ws     [audio, WebRTC]
```

The key point: **your server is not on the audio path.** It runs once, before
the call, to mint a token. The browser then talks directly to Sonus, so a web
call has the same latency as a phone call. Nothing about this changes if your
backend is slow, far away, or serverless.

The browser never receives a Sonus credential. The token authorises exactly one
room, expires in two minutes if unused, and can neither read nor change
anything in your account.

## Run it

```sh
bun install
cp .env.example .env.local     # fill in the three values
bun dev                        # http://localhost:3100
```

`package.json` currently points `@kejue/sonus-web` at a local tarball. Once the
package is published, swap that for a normal version range:

```jsonc
{ "dependencies": { "@kejue/sonus-web": "^0.1.0" } }
```

You need an API key with the **`calls:start-web`** permission — create it in the
dashboard under Settings → API keys. Two things that will bite you:

- The person creating the key must themselves hold `calls:start-web`, or you get
  `permission_escalation`. Owners and admins do.
- Give the key *only* `calls:start-web`. It can then start calls and nothing
  else — it can't even list them.

## What the SDK gives you

```ts
const call = await SonusWebCall.start({
  credentials: () => fetch('/api/start-call', { method: 'POST' }).then(r => r.json()),
});

call.on('stateChange', s => ...);       // listening | thinking | speaking | ...
call.on('transcriptUpdate', lines => ...); // full transcript, re-sent on change
call.on('tool', t => ...);              // { name, status } — "Checking your account…"
call.on('disconnected', () => ...);

await call.mute();
await call.hangup();
```

Pass `credentials` as a **function**, not a value. It runs at connect time, so
the token is always freshly minted; one sitting in a variable may have expired.

Events: `stateChange`, `transcript`, `transcriptUpdate`, `tool`, `noise`,
`handoff`, `dtmf`, `error`, `disconnected`. `on()` returns an unsubscribe
function. A listener that throws can't break the call.

### Tool payloads are withheld by default

`tool` events carry the tool **name** and **status** — enough to render
"Checking your account…". They do *not* carry `args` or `output` unless you set
`includeToolPayloads: true`.

Those are raw request/response bodies from your own backend — account numbers,
balances, whatever the tool returned — and this code runs in your **end user's**
browser. Turn the flag on only for an embed on a trusted internal page (a
support console), never on a page a customer reaches.

## Passing context to the agent

`variables` in the server route are rendered into the agent's prompt as
`{{user_name}}` etc. They're trustworthy precisely because they come from your
server after you've authenticated the user — never accept them from the browser.

`metadata` is opaque to Sonus, stored on the call, and returned by
`GET /v1/calls/{id}`. Use it to join calls back to your own records.

`call_id` comes back immediately, before the call connects, so you can write
your side of the correlation up front.

## Installing the SDK

```sh
bun add @kejue/sonus-web livekit-client
```

`livekit-client` is a peer dependency — your app owns the version.

```ts
import { SonusWebCall } from '@kejue/sonus-web';
```

This demo was verified against the built package (installed from the packed
tarball, not the source), so what you see here is what a customer gets.

## You do not actually need the SDK

The SDK is convenience. The contract is the token plus `livekit-client`, which
IS on npm. A complete call without it:

```ts
import { Room, RoomEvent } from 'livekit-client';

const { token, ws_url } = await fetch('/api/start-call', { method: 'POST' })
  .then((r) => r.json());

const room = new Room();

// Do not skip this. livekit-client SUBSCRIBES to the agent's audio but never
// routes it to an output device. Without attaching it the call connects, the
// agent speaks, and you hear nothing — every other signal looks healthy.
room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === 'audio') document.body.appendChild(track.attach());
});

await room.connect(ws_url, token);
await room.localParticipant.setMicrophoneEnabled(true, undefined, {
  preConnectBuffer: true,
});
```

The server half (`app/api/start-call/route.ts`) is identical either way — that
is the part that matters, and it is nine lines of `fetch`.

What the SDK saves you re-implementing: agent state off the `lk.agent.state`
attribute, transcript parsing (a **cumulative** `{kind:"snapshot", turns:[…]}`
on the `sonus.transcript` topic, keyed on `speaker` — appending naively
duplicates the whole conversation), tool/handoff/DTMF events, keeping tool
arguments out of the browser, and teardown.

## Verified

Built and run against `api-staging.sonus.ws`: the server route returns 201, the
browser connects, the agent greets you, the transcript renders, hang-up returns
the UI to its initial state. `demo.png` is a screenshot of a live call.

Audio was **measured**, not assumed — an AnalyserNode on the attached element
during the greeting read a peak amplitude of 46/127 with signal in 37 of 160
samples. That check exists because an earlier version of the SDK never attached
the audio at all: the call connected, the state said `speaking`, the transcript
filled in, and there was no sound. Agent state and transcript ride the data
channel, so they prove nothing about audio. If you fork this, keep measuring the
audio separately.
