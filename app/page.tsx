import { ModeSwitch } from '@/components/mode-switch';

export default function Home() {
  return (
    <main>
      <h1>Sonus web calls</h1>
      <p className="lede">
        One agent, two surfaces. Your backend mints a short-lived token; this
        page connects straight to Sonus.
      </p>
      <ModeSwitch />
      <footer>
        <p>
          Server route: <code>app/api/start-call/route.ts</code> — the only place
          the API key exists, and the only difference between the two surfaces
          (<code>modality: &apos;audio&apos; | &apos;text&apos;</code>).
          <br />
          Browser: <code>components/call-panel.tsx</code> (voice) and{' '}
          <code>components/chat-panel.tsx</code> (text) — neither ever sees a
          credential.
        </p>
      </footer>
    </main>
  );
}
