"use client";
import { useActionState, useState } from "react";
import { signInAction } from "./actions";

export default function SignInForm({ notice, signup, start = "in" }: { notice?: string; signup: boolean; start?: "in" | "up" }) {
  const [mode, setMode] = useState<"in" | "up">(signup ? start : "in");
  const [error, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} className="card" style={{ width: 360 }}>
      <h1>{mode === "in" ? "Sign in" : "Create account"}</h1>
      <input type="hidden" name="mode" value={mode} />
      {mode === "up" && <p><label>Name</label><input name="name" required /></p>}
      <p><label>Email</label><input name="email" type="email" autoComplete="email" required /></p>
      <p><label>Password</label><input name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required /></p>
      {(error || notice) && <p style={{ color: "var(--danger)" }}>{error || notice}</p>}
      <button disabled={pending} style={{ width: "100%" }}>{pending ? "Please wait..." : mode === "in" ? "Sign in" : "Create account"}</button>
      {signup && <p className="muted" style={{ textAlign: "center" }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>
          {mode === "in" ? "First time? Create your account" : "Have an account? Sign in"}</a></p>}
    </form>
  );
}
