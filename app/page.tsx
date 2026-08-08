import { CallPanel } from '@/components/call-panel';

export default function Home() {
  return (
    <main>
      <h1>Sonus web call</h1>
      <p className="lede">
        Your backend mints a short-lived token; this page connects straight to
        Sonus over WebRTC. Audio never touches your server.
      </p>
      <CallPanel />
      <footer>
        <p>
          Server route: <code>app/api/start-call/route.ts</code> — the only place
          the API key exists.
          <br />
          Browser: <code>components/call-panel.tsx</code> — never sees a credential.
        </p>
      </footer>
    </main>
  );
}
