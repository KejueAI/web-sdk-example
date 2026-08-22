// POST /api/start-call — the ONLY server-side piece of a Sonus web-call
// integration, and the only place your API key is ever allowed to exist.
//
// The browser calls this, gets back a short-lived token, and connects straight
// to Sonus. Nothing passes through this server afterwards, so this route runs
// once per call and is nowhere near the media path — a web call has the same
// latency as a phone call.
//
// One route serves BOTH surfaces. The browser asks for `audio` or `text` and
// this route forwards it; everything else — the agent, the variables, the
// metadata, the key — is identical, because on the Sonus side it is the same
// agent either way.

import { NextResponse } from 'next/server';

type Modality = 'audio' | 'text';

const API_URL = process.env.SONUS_API_URL ?? 'https://api.sonus.ws';
const API_KEY = process.env.SONUS_API_KEY;
const AGENT_ID = process.env.SONUS_AGENT_ID;

export async function POST(request: Request) {
  // The browser picks the surface. Validate it here rather than forwarding
  // whatever arrives — this is your endpoint, and Sonus rejects (rather than
  // coerces) anything it does not recognise.
  let modality: Modality = 'audio';
  try {
    const body = (await request.json()) as { modality?: string };
    if (body?.modality === 'text') modality = 'text';
  } catch {
    // No body — keep the default. Voice is what an older caller expects.
  }

  if (!API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: 'Set SONUS_API_KEY and SONUS_AGENT_ID in .env.local (see .env.example)' },
      { status: 500 },
    );
  }

  // ── Authenticate YOUR user here ────────────────────────────────────────
  // In a real app this is where you check the session and decide whether this
  // person is allowed to start a call at all. Whatever you learn about them
  // here is what you pass as `variables` below — that is the only trustworthy
  // way for the agent to know who it is talking to, because it comes from your
  // server and never from the browser.
  //
  //   const session = await auth();
  //   if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = { firstName: 'Alex', plan: 'premium', id: 'user_123' };

  const res = await fetch(`${API_URL}/v1/web-calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      // Required on every API-key POST. Stops a retry from creating a second
      // call if the response is lost in flight.
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      agent_id: AGENT_ID,

      // 'audio' (the default) or 'text'. Same agent, same prompt, same tools —
      // only the input and output planes differ. A text call is billed as
      // minutes for its full duration, exactly like a voice call, and shares
      // the same concurrency limit.
      modality,

      // Rendered into the agent's prompt as {{user_name}} / {{plan}}. This is
      // how the agent greets someone by name or knows their tier without
      // asking. Names must match [A-Za-z_][A-Za-z0-9_]{0,63}.
      variables: {
        user_name: user.firstName,
        plan: user.plan,
      },

      // Opaque to Sonus — stored on the call and returned by
      // GET /v1/calls/{id}. Useful for joining calls back to your own records.
      metadata: {
        your_user_id: user.id,
        source: 'sdk-test',
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    // Surface the real error while developing. In production you would log
    // this and return something generic — the body can name your agent id.
    console.error('[sonus] mint failed', res.status, body);
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // { call_id, token, ws_url, room_name, agent_name, expires_at_ms, modality }
  //
  // `modality` is echoed back, which is what lets the browser hand the whole
  // response to startCall() and get the right transport without being told.
  //
  // Handing the whole thing to the browser is fine. `token` authorises exactly
  // one room, expires in two minutes if unused, and can neither read nor
  // change anything else in your account.
  //
  // Keep `call_id` if you want to correlate — it is live immediately against
  // GET /v1/calls/{id}, before the call has even connected.
  return new NextResponse(body, {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
