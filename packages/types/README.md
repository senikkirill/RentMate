# @rentmate/types

Single module for domain types used by web, Mini App, and API.

- `entityStatus: "current"` — exists in live DB / Edge Functions
- `entityStatus: "planned"` — SaaS entities not in the database yet

`LEGACY_TABLE` maps Organization → `garages`, Vehicle → `units`.
