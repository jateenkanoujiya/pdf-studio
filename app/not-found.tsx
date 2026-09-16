import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-state" style={{ minHeight: "100vh" }}>
      <h1>This page took a different route.</h1>
      <p>Find what you need in your PDF workspace.</p>
      <Link className="primary-btn" href="/">
        Back to all tools
      </Link>
    </main>
  );
}
