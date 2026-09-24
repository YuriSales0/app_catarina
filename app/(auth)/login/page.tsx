import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/config";
import { getActor } from "@/lib/auth/session";
import { getSignInOptions } from "@/lib/auth/options";
import { copy } from "@/lib/copy/en";

export default async function LoginPage(props: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const actor = await getActor();
  if (actor) redirect("/dashboard");
  const { callbackUrl, error } = await props.searchParams;
  const options = getSignInOptions();
  const target = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: target });
  }

  async function devSignIn(formData: FormData) {
    "use server";
    await signIn("dev-login", {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      redirectTo: target,
    });
  }

  async function accessCodeSignIn(formData: FormData) {
    "use server";
    try {
      await signIn("access-code", {
        email: String(formData.get("email") ?? ""),
        code: String(formData.get("code") ?? ""),
        redirectTo: target,
      });
    } catch (e) {
      // A rejected code throws; success throws Next's redirect, which must propagate.
      if (e instanceof AuthError) redirect(`/login?error=${e.type}&callbackUrl=${encodeURIComponent(target)}`);
      throw e;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.appName}</h1>
        <p className="text-muted">{copy.tagline}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          Sign-in failed ({error}). Please try again.
        </p>
      ) : null}

      <section aria-labelledby="login-title" className="space-y-6 rounded-lg border border-border bg-surface p-6">
        <h2 id="login-title" className="text-lg font-medium">
          {copy.login.title}
        </h2>

        {options.google ? (
          <form action={googleSignIn}>
            <button type="submit" className="btn btn-primary w-full">
              {copy.login.google}
            </button>
          </form>
        ) : null}

        {options.devLogin ? (
          <form action={devSignIn} className="space-y-3 border-t border-border pt-6">
            <h3 className="text-sm font-medium">{copy.login.devTitle}</h3>
            <p className="text-xs text-muted">{copy.login.devHint}</p>
            <label className="block text-sm">
              <span className="mb-1 block">{copy.login.email}</span>
              <input name="email" type="email" required autoComplete="email" className="input" placeholder="parent@example.com" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">{copy.login.name}</span>
              <input name="name" type="text" autoComplete="name" className="input" placeholder="Your name" />
            </label>
            <button type="submit" className="btn btn-secondary w-full">
              {copy.login.submit}
            </button>
          </form>
        ) : null}

        {options.accessCode ? (
          <form action={accessCodeSignIn} className="space-y-3">
            <h3 className="text-sm font-medium">{copy.login.accessTitle}</h3>
            <p className="text-xs text-muted">{copy.login.accessHint}</p>
            <label className="block text-sm">
              <span className="mb-1 block">{copy.login.email}</span>
              <input name="email" type="email" required autoComplete="email" className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">{copy.login.accessCode}</span>
              <input name="code" type="password" required autoComplete="current-password" className="input" />
            </label>
            <button type="submit" className="btn btn-secondary w-full">
              {copy.login.submit}
            </button>
          </form>
        ) : null}

        {!options.google && !options.devLogin && !options.accessCode ?<p className="text-sm text-danger">{copy.login.noProviders}</p> : null}
      </section>
    </main>
  );
}
