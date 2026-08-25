# Contract: Lane Configuration File (extended)

**Branch**: `029-up-next-dashboard`. Extends the `specs/001-create-task/contracts/lanes-config.md` contract; loaded once at boot by `loadLanesConfig` (`src/server/lanes-config.ts`), applied by restart (FR-006). Path resolution unchanged: explicit arg → `LANES_CONFIG_PATH` → `config/lanes.json`.

## Accepted file shapes (union — both valid forever)

**Legacy form** (every deployed file today; stays valid so bind-mounted production configs keep booting):

```json
["To Do", "In Progress", "Waiting", "Done"]
```

**Object form** (new; how the dashboard designations are expressed):

```json
{
  "lanes": ["Up Next", "In Progress", "Waiting", "Done"],
  "dashboardDefaultLanes": ["Up Next", "In Progress"],
  "quickDoneLane": "Done"
}
```

`dashboardDefaultLanes` and `quickDoneLane` are each independently optional.

## Validation rules

- `lanes` (or the legacy bare array): non-empty trimmed strings, ≥1 entry, unique — unchanged from today.
- `dashboardDefaultLanes` when present: ≥1 entry, unique, every entry a member of `lanes`.
- `quickDoneLane` when present: a member of `lanes`.
- Any violation, unreadable file, or invalid JSON throws at boot with the config path embedded in the message (the deploy test asserts the filename appears in startup logs — preserve exact style of existing messages).

## Normalized result (what the server sees)

```ts
{ lanes: string[], dashboard: { defaultLanes: string[], quickDoneLane: string } }
```

Fallbacks applied during load (FR-006 / spec edge case "config without the new designations"):

- `dashboardDefaultLanes` absent (including every legacy-form file) → `defaultLanes = [lanes[0]]` (first configured lane).
- `quickDoneLane` absent → `quickDoneLane = lanes[lanes.length - 1]` (last configured lane).

## Semantics

- Lane order = `lanes` array order; the dashboard's flat list always sorts by this order — `dashboardDefaultLanes` only *selects* lanes, its own ordering carries no meaning (FR-002).
- The designations surface to the client via `GET /api/dashboard` (`defaultLanes`, `quickDoneLane`) — see `contracts/dashboard-api.md`.
- The committed dev `config/lanes.json` stays in legacy form (exercises the fallback path); acceptance runs point `LANES_CONFIG_PATH` at an object-form fixture (research D14).
