# Migrations

`*-StmcBaseline.ts` is the whole schema, and the only migration registered in
`../data-source.ts`.

The eight `1727*` files beside it are superseded and are **not** registered.
They were written by hand, were never executed against any database (every
environment ran on `DB_SYNCHRONIZE=true`), and had drifted badly from the
entities: they were missing seven `cameras` columns, `detections.snapshot`
and `evidenceStill`, `enrollments.aiPersonId`, `settings.purgeEnabled` and
`building_settings.unitOwners` — a server built from them would have had no
working cameras, no evidence capture and no face-capture lifecycle.

They are kept only so the history is not lost. They can be deleted. Do not
add them back to the migrations array: the baseline already creates
everything they create.

## Adding a change

1. Edit the entity.
2. `npm run migration:generate -- src/database/migrations/WhatChanged`
3. Register the new class in `../data-source.ts`, after the baseline.

`npm run migration:generate` diffs the entities against the database in your
`.env`, so point it at an up-to-date database or the diff will be wrong.
