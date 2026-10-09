export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 360, margin: "60px auto" }} className="panel">
      <h1>Sign in</h1>
      <p className="sub">The call log holds callers' names, numbers and transcripts.</p>
      <form method="post" action="/api/login" style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <input type="password" name="password" placeholder="Dashboard password" autoFocus required />
        {sp.error && <div className="no">Wrong password.</div>}
        <button type="submit">Open dashboard</button>
      </form>
    </div>
  );
}
