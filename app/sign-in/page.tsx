export const metadata = { title: "Sign in" };
import SignInForm from "./SignInForm";
import { isSaas } from "@/lib/mode";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  const { error, mode } = await searchParams;
  return <div style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
    <SignInForm start={mode === "up" ? "up" : "in"} signup={isSaas() || process.env.ALLOW_SIGNUP === "true"} notice={error === "not-allowed" ? "This account is not allowed to use this app." : undefined} /></div>;
}
