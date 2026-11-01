import SignInForm from "./SignInForm";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
    <SignInForm signup={process.env.ALLOW_SIGNUP === "true"} notice={error === "not-allowed" ? "This account is not allowed to use this app." : undefined} /></div>;
}
