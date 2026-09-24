/** All parent-facing copy in one place so translation is not a rewrite. */
export const copy = {
  appName: "Learning OS",
  tagline: "Learning based on evidence, not chatbot memory.",
  login: {
    title: "Sign in",
    google: "Continue with Google",
    devTitle: "Development sign-in",
    devHint: "Available only outside production. Any email creates a parent account.",
    email: "Email",
    name: "Name",
    submit: "Sign in",
    accessTitle: "Sign in with an access code",
    accessHint: "For invited evaluators. Use the email you were invited with.",
    accessCode: "Access code",
    noProviders: "No sign-in method is configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or AUTH_DEV_LOGIN=true in development.",
  },
  nav: {
    dashboard: "Dashboard",
    students: "Students",
    curricula: "Curricula",
    signOut: "Sign out",
  },
  demoBadge: "DEMO",
  demoNotice: "Demo data. This is not a real student's history.",
} as const;
