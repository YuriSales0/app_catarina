import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/config";
import { getActor } from "@/lib/auth/session";
import { getSignInOptions } from "@/lib/auth/options";
import Link from "next/link";
import { copy } from "@/lib/copy/pt";
import { Logo, Lumi } from "@/components/brand/lumi";

export default async function LoginPage(props: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const actor = await getActor();
  if (actor) redirect("/dashboard");
  const { callbackUrl, error } = await props.searchParams;
  const options = getSignInOptions();
  const target = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";

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

  const anyMethod = options.google || options.devLogin || options.accessCode;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-lavender p-12 lg:flex">
        <Link href="/" className="w-fit rounded-full">
          <Logo />
        </Link>
        <div aria-hidden className="absolute -right-20 -bottom-24 h-96 w-96 rounded-full bg-peach/70 blur-3xl" />
        <div className="relative">
          <Lumi size={150} mood="cheer" className="animate-float" />
          <p className="mt-8 max-w-sm font-display text-3xl leading-tight font-semibold">&ldquo;Hello! Vamos aprender inglês juntos?&rdquo;</p>
          <p className="mt-3 max-w-sm text-lavender-ink">O Lumi guia a criança. Você acompanha cada passo.</p>
        </div>
        <p className="relative text-xs text-lavender-ink">{copy.tagline}</p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-flex rounded-full lg:hidden">
            <Logo />
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{copy.login.title}</h1>
          <p className="mt-2 text-muted">{copy.login.subtitle}</p>

          {error ? (
            <p role="alert" className="mt-6 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
              {copy.login.failed}
            </p>
          ) : null}

          <section aria-label="Formas de entrar" className="card mt-8 space-y-6">
            {options.google ? (
              <form action={googleSignIn}>
                <button type="submit" className="btn btn-primary btn-lg w-full">
                  {copy.login.google}
                </button>
              </form>
            ) : null}

            {options.accessCode ? (
              <form action={accessCodeSignIn} className="space-y-4">
                <div>
                  <h2 className="font-bold">{copy.login.accessTitle}</h2>
                  <p className="text-xs text-muted">{copy.login.accessHint}</p>
                </div>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-bold">{copy.login.email}</span>
                  <input name="email" type="email" required autoComplete="email" className="input" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-bold">{copy.login.accessCode}</span>
                  <input name="code" type="password" required autoComplete="current-password" className="input" />
                </label>
                <button type="submit" className="btn btn-primary w-full">
                  {copy.login.submit}
                </button>
              </form>
            ) : null}

            {options.devLogin ? (
              <form action={devSignIn} className="space-y-4">
                <div>
                  <h2 className="font-bold">{copy.login.devTitle}</h2>
                  <p className="text-xs text-muted">{copy.login.devHint}</p>
                </div>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-bold">{copy.login.email}</span>
                  <input name="email" type="email" required autoComplete="email" className="input" placeholder="familia@exemplo.com" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-bold">{copy.login.name}</span>
                  <input name="name" type="text" autoComplete="name" className="input" placeholder="Seu nome" />
                </label>
                <button type="submit" className="btn btn-secondary w-full">
                  {copy.login.submit}
                </button>
              </form>
            ) : null}

            {!anyMethod ? <p className="text-sm text-danger">{copy.login.noProviders}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
