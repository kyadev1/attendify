# Phase 12B.1 — My Events frontend integration

The existing local builder now appears in a Registration Questions section below Event Details/Event Preview in both My Events → Create Event and My Events → Edit Event. No navigation item or new route was added. The standalone Phase 12A preview remains available.

## Local setup

Set `VITE_ENABLE_FORM_BUILDER_PROTOTYPE=true` in the root ignored `.env.local`, restart `npm run dev`, and sign in as an existing Organizer. Open My Events, then Create Event or Edit Event on your own event. No environment file was changed automatically.

The integration requires Vite DEV, not PROD, and the exact flag string `true`. It is off by default and excluded from production, including when the flag is true during a production build. Students and non-owning organizers do not receive the builder. Existing route and ownership guards are preserved.

## Behavior and safety

- Reuses the Phase 12A component: five types, required/optional, choices, reordering/removal and Student Preview with local validation.
- The section explicitly says: “Preview only — registration questions are not saved.” Creating/saving events continues to save Event Details only.
- The builder is a sibling of the event form, not nested inside it. Its preview form and validation cannot trigger or block event submission.
- Builder state is private to the component. It has no save callback, service import, or connection to the event `values` object. Tests verify exact save payload keys for both create and edit; no question/answer fields are included.
- Drafts and fictional preview answers survive ordinary event-field rerenders and saves while the page stays mounted, but are not persisted. Leaving, refreshing, changing events or account generation discards them. Each new editor starts empty, even after a previously successful event save.
- Account/event-keyed error and Suspense boundaries isolate loading failures. Embedded heading levels avoid a second page h1. Existing token-based responsive styling is reused.
- No new custom-question success message, backend endpoint, Supabase write, schema/RLS/RPC change, or Student form modification exists.

## Exact files changed

- `src/pages/organizer/components/CreateEventForm.jsx`: gated lazy builder section, role/ownership checks, keyed boundary and explicit unsaved-state copy. Existing fields, validation and submit payload are unchanged.
- `src/features/registrationForms/components/RegistrationFormBuilder.jsx`: optional `embedded` prop for appropriate heading levels; standalone behavior unchanged.
- `tests/form-builder-integration.test.mjs`: eight tests for disabled/production gating, organizer ownership, create/edit reuse, form separation, payload isolation and draft boundary keys.
- `docs/PHASE12B1.md`: this report.

## Verification

| Command | Result |
| --- | --- |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 279 passed, 0 failed/skipped |
| `npm.cmd test --prefix backend` | 39 passed, 0 failed/skipped |
| `npm.cmd run lint` | Passed; no errors/warnings |
| `npm.cmd run build` | Passed; no chunk-size warning |

The full frontend suite includes the existing 25 builder validation/interaction/preview/isolation tests and production exclusion test, plus prior event, registration, account-isolation and attendance regressions. Node's existing experimental VM Modules notice is test-only. No live database mutation tests were run. Live browser focus, mobile layout and screen-reader behavior remain manual checks.

## Next phase

This is a frontend prototype integration, not saved custom registration. Before persistence, inspect deployed registration RPC/constraints and RLS, finish outstanding live authorization checks, approve versioned immutable form/answer contracts and privacy rules, implement server validation/ownership and student isolation, and verify atomic registration-plus-answer storage without bypassing capacity or duplicate protection through the legacy RPC. Preserve existing ticket IDs and QR payloads. The detailed design is in PHASE12A_FORM_BUILDER.md. No persistence or production activation is authorized or implemented here.
