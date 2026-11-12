# Website: site/ + Supabase + Vercel
Status 2026-11-12: `site/` and `supabase/` were being created by a separate agent when this wiki was written, so this page
documents only the contract. Update it from the real files (`site/`, `supabase/`, any `vercel.json`) once they land.
- `site/` is a static marketing site deployed on Vercel (project root = `site/`).
- `supabase/` holds schema/migrations/functions for the site backend.
- **Secrets**: Supabase service-role keys and Vercel tokens live only in the Vercel/Supabase dashboards and env vars, never in git. Only a public anon key and URL may appear in client code. QA agents must not touch site secrets or deploy.
- The game itself has no backend; it saves to localStorage and the CrazyGames data module.
