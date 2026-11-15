# Evidence-gated, optional stack lenses

Activate a lens only when the **provided files/dependencies actually show**
the relevant stack; record framework/API version where available. Each lens
adds concrete questions and falsifiers, not automatic findings. If the source
is missing, use `NOT_INSPECTED`; never infer a stack from the user's job
title or repository name.

| Evidence seen | Lens |
| --- | --- |
| FastAPI routes, Pydantic responses | [FastAPI / Pydantic](fastapi-pydantic.md) |
| PostgreSQL, Supabase/PostgREST client, RLS policies | [Supabase / Postgres](supabase-postgres.md) |
| React state/hooks, TypeScript HTTP client | [React / TypeScript](react-typescript.md) |
| Tool-calling LLM agents or retrieval pipelines | [LLM / Agents](llm-agents.md) |

Multiple lenses can apply; prioritize the smallest end-to-end chain and
avoid duplicating one underlying failure as several independently confirmed
findings. Preserve E0/NOT_RUN until actual target evidence exists.
