"use server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { allowedEmails } from "@/lib/auth";

export async function signInAction(_: string | null, f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const password = String(f.get("password") ?? "");
  const mode = String(f.get("mode") ?? "in");
  if (!allowedEmails().includes(email)) return "This email is not allowed to use this app.";
  if (mode === "up") {
    if (password.length < 10) return "Use at least 10 characters for the password.";
    const { error } = await auth.signUp.email({ email, password, name: String(f.get("name") ?? email) });
    if (error) return error.message ?? "Could not create the account.";
  } else {
    const { error } = await auth.signIn.email({ email, password });
    if (error) return error.message ?? "Wrong email or password.";
  }
  redirect("/");
}

export async function signOutAction() {
  await auth.signOut();
  redirect("/sign-in");
}
