# Nervur Onboarding Flow — Branch Map & UX Analysis

## Step Definitions

| #   | Step ID      | Title        | Visible On          |
| --- | ------------ | ------------ | ------------------- |
| 1   | `choose`     | Setup        | Both paths          |
| 2   | `connect`    | Connect      | Both paths          |
| 3   | `identity`   | Create Brain | Both paths          |
| 4   | `networking` | Networking   | **Fresh path only** |
| 5   | `done`       | Complete     | Both paths          |

Existing path sees 4 steps (networking is filtered out).
Fresh path sees all 5.

---

## Full Branch Graph

```mermaid
                          ┌──────────┐
                          │  START   │
                          │ (choose) │
                          └────┬─────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼                             ▼
        ┌────────────────┐           ┌────────────────┐
        │   PATH: FRESH  │           │ PATH: EXISTING │
        │ "Spin up new"  │           │ "Connect to    │
        │                │           │  running HS"   │
        └───────┬────────┘           └───────┬────────┘
                │                             │
                ▼                             ▼
  ┌──────────────────────────┐    ┌───────────────────────┐
  │  CONNECT (FreshOnboarding)│    │  CONNECT (inline form) │
  │                          │    │  Enter URL → Verify    │
  │  Internal phases:        │    └──────────┬────────────┘
  │                          │               │
  │  ┌─────────┐             │               │
  │  │checking │─preflight   │               │
  │  └────┬────┘             │               │
  │       │                  │               │
  │  ┌────┴────────────┐     │               │
  │  │ Docker OK?      │     │               │
  │  │ Containers?     │     │               │
  │  └─┬──────────┬────┘     │               │
  │    │          │          │               │
  │    │ existing │ clean    │               │
  │    │ found    │ system   │               │
  │    ▼          ▼          │               │
  │  ┌──────┐  ┌──────┐     │               │
  │  │choose│  │input │     │               │
  │  └──┬───┘  └──┬───┘     │               │
  │     │         │          │               │
  │  ┌──┴──┐      │          │               │
  │  │Use  │Recon-│          │               │
  │  │exist│figure│          │               │
  │  │ing  │  │   │          │               │
  │  │  │  │  ▼   │          │               │
  │  │  │  │input │          │               │
  │  │  │  └──┬───┘          │               │
  │  │  ▼     ▼              │               │
  │  │ ┌──────────┐          │               │
  │  │ │provision │          │               │
  │  │ │ configure│          │               │
  │  │ │ pull     │          │               │
  │  │ │ start    │          │               │
  │  │ │ verify   │          │               │
  │  │ └────┬─────┘          │               │
  │  │      │                │               │
  │  └──┬───┘                │               │
  │     ▼                    │               │
  │  ┌──────┐                │               │
  │  │ done │                │               │
  │  └──┬───┘                │               │
  └─────┼────────────────────┘               │
        │                                    │
        ▼                                    ▼
  ┌──────────────────────────────────────────────┐
  │              IDENTITY (Create Brain)          │
  │                                              │
  │  Inputs:                                     │
  │  • Display name                              │
  │  • Username (default: "brain")               │
  │  • Registration key:                         │
  │    - Fresh: auto-filled from provisioning    │
  │    - Existing: generate OR paste             │
  │                                              │
  │  Action: preflight → init-brain              │
  └─────────────────┬────────────────────────────┘
                    │
          ┌─────────┴──────────┐
          │                    │
     path=fresh          path=existing
          │                    │
          ▼                    ▼
  ┌───────────────┐     ┌──────────┐
  │  NETWORKING   │     │   DONE   │
  │  (fresh only) │     │          │
  └───────┬───────┘     └──────────┘
          │
   ┌──────┼──────────────┐
   │      │              │
   ▼      ▼              ▼
┌──────┐┌────────┐ ┌────────────┐
│Local ││Direct  │ │ Cloudflare │
│Only  ││Route   │ │   Tunnel   │
│      ││        │ │            │
│skip→ ││domain  │ │ domain     │
│done  ││  ↓     │ │   ↓        │
│      ││DNS chk │ │ probe      │
│      ││  ↓     │ │   ↓        │
│      ││config  │ │ ┌──────┐   │
│      ││well_   │ │ │works?│   │
│      ││known   │ │ └─┬──┬─┘   │
│      ││  ↓     │ │   │  │     │
│      ││verify  │ │  yes  no   │
│      ││HTTPS   │ │   │  ↓     │
│      ││  ↓     │ │   │token   │
│      ││done    │ │   │input   │
│      │└───┬────┘ │   │  ↓     │
│      │    │      │   │config  │
│      │    │      │   │  ↓     │
│      │    │      │   │poll    │
│      │    │      │   │  ↓     │
│      │    │      │   │verify  │
│      │    │      │   │  ↓     │
│      │    │      │   └┬─┘     │
│      │    │      │    │       │
│      │    │      └────┼───────┘
│      │    │           │
└──┬───┘    │           │
   │        │           │
   └────────┴─────┬─────┘
                  ▼
            ┌──────────┐
            │   DONE   │
            │          │
            │ Brain ID │
            │ shown    │
            └──────────┘
```

---

## Path Summary

### Path A: Existing Homeserver (4 visible steps)

```mermaid
choose → connect → identity → done
```

- User provides a homeserver URL
- Verifies connectivity
- Generates or pastes a registration key
- Creates brain account
- Done

### Path B: Fresh Homeserver (5 visible steps)

```mermaid
choose → connect → identity → networking → done
```

With connect having its own internal state machine (checking → choose/input → provision → done).

And networking branching into three sub-paths:

| Sub-path         | What happens                                     |
| ---------------- | ------------------------------------------------ |
| **Local only**   | Skip networking entirely                         |
| **Direct route** | User provides domain + DNS + reverse proxy + TLS |
| **CF Tunnel**    | User provides domain + optional tunnel token     |

---

## State Persistence & Resume Logic

The flow supports **resuming after page refresh** via `savedConfig.onboarding`:

- Identity fields (name, username, registration key) are restored
- Fresh path: can resume at networking step if identity was completed
- Existing path: re-verifies homeserver live before resuming at identity

---

## UX Observations

### What works well

1. **Clear binary choice at the start** — fresh vs existing is a meaningful fork
2. **Progressive disclosure** — FreshOnboarding hides complexity behind phases
3. **Live validation** — port checking, DNS probing, homeserver verification give immediate feedback
4. **Step-by-step checklists** — provisioning and networking show granular progress with icons
5. **State resume** — users don't lose progress on page refresh

### Potential issues

1. **Step count mismatch** — The stepper shows 4 or 5 steps depending on path, but this is decided _after_ step 1. The stepper header changes after the user has already seen it, which can feel disorienting.

2. **Nested state machines** — FreshOnboarding has its own 5-phase flow _within_ the "Connect" step. From the user's perspective, the stepper stays on step 2 while they go through checking → choose → input → provision → done internally. This makes the stepper feel stuck/misleading — the user is doing significant work but the progress bar doesn't advance.

3. **Networking step also has deep sub-flows** — The Cloudflare tunnel path has probe → token input → configure → poll → verify, all within one stepper step. Same "stuck progress bar" problem.

4. **Registration key UX on existing path** — The generate/paste toggle with the "save this key" warning is cognitively heavy. Users may not understand what a registration key is or why they need to save it. The relationship between key + username = identity is a novel concept that needs more framing.

5. **Error recovery paths are unclear** — If provisioning fails at step 3/5, the user sees a red X but the recovery action isn't always obvious. Can they retry? Do they need to start over?

6. **"Local only" in networking is a skip** — It jumps to done, which is fine, but it might feel abrupt. No confirmation that local-only means the brain won't be reachable from the internet.

7. **Back navigation** — The back button exists but some transitions (like going back from networking to identity) may leave state in an inconsistent position since brain creation already happened.

8. **Domain input validation** — Direct route and tunnel paths accept a domain but don't validate format before attempting DNS resolution. Early format validation would prevent unnecessary API calls.

9. **Fresh path "choose" sub-phase** — When existing containers are detected, the user gets a choice between "use existing" and "reconfigure." This is a significant decision buried inside a sub-phase of the connect step, not reflected in the main stepper at all.

10. **No way to change path after choosing** — Once you pick fresh or existing, the only way back is the browser back button or resetting. The stepper's back button on step 2 could take you back to choose, but the implications of switching paths mid-flow aren't handled.

---

## API Dependency Map

```mermaid
Existing path:
  verify-homeserver → generate-key → save-identity → preflight → init-brain

Fresh path:
  fresh/preflight → fresh/check-port → fresh/configure → fresh/pull →
  fresh/start → fresh/verify → preflight → init-brain →
  networking/check-dns → networking/configure-tunnel →
  networking/check-cloudflared → networking/save
```
