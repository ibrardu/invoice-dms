"use client";
import Link from "next/link";
import { useEffect } from "react";

// Shown instead of the default error screen. Server messages are shown when they are meant for people
// (our actions throw readable messages, e.g. "This invoice was sent and is locked").
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const readable = error.message && !/^(An error occurred|Internal|fetch failed)/i.test(error.message) && error.message.length < 200;
  return (
    <div className="state">
      <h1>That did not work</h1>
      <p className="callout">{readable ? error.message : "Something went wrong on our side. Nothing was saved twice; you can try again."}</p>
      <div className="row"><button onClick={reset}>Try again</button><Link className="btn ghost" href="/">Back to overview</Link></div>
      {error.digest && <p className="muted num">Reference {error.digest}</p>}
    </div>
  );
}
