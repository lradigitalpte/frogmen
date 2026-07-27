# Frog1 — Agent Guide

Guidance for AI agents working in the `frog1` monorepo (NestJS API + Next.js web + Drizzle DB).

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/api` | NestJS REST API |
| `apps/web` | Next.js dashboard (Shopify Polaris UI) |
| `packages/db` | Drizzle schema + migrations |
| `packages/shared` | Shared types and document templates |
| `frog/plugins/webkul/rov-inspection` | Legacy ROV reference (Filament/Laravel) — UX parity target |

## UI rules (web)

**Use Polaris and existing app components. Do not build custom HTML controls.**

### Dropdowns and pickers

| Use case | Component | Path |
|----------|-----------|------|
| Simple enum / status / section switcher | `Select` from `@shopify/polaris` | — |
| Rich labeled options with descriptions | `AppSelect` | `@/components/ui/app-select` |
| Customer search | `CustomerPicker` | `@/components/sales/customer-picker` |
| Warranty policy | `WarrantyPolicyPicker` | `@/components/warranty/warranty-policy-picker` |

**Do not use:** raw `<select>`, custom `<button>` popover menus, or one-off HTML dropdowns.

### Forms

- Page shell: `AppPage` from `@/components/layout/page`
- Section cards: `QuotationFormSection` from `@/components/sales/quotation-form-section`
- Layout: Polaris `Layout`, `FormLayout`, `FormLayout.Group`
- Lists: `IndexTable`, `IndexFilters` via `IndexSurface`

### Status and badges

- Use Polaris `Badge` with `tone` (`success`, `warning`, `attention`, `info`) — not custom `<span>` status pills.

### File uploads

- Images: Polaris `DropZone` or the shared `RovProjectImageUpload` component
- One plan-view image per project (CAD / site map) — not separate plan + site map fields on the form

### Styling

- Prefer Polaris tokens and existing utility classes (`cn` from `@/lib/utils`)
- Module-specific CSS only in `apps/web/src/app/globals.css` under `.rov-*` prefixes when Polaris layout is insufficient
- Do not add inline styles for controls that Polaris already provides

## ROV Inspection module

### Web (`apps/web/src/components/rov/`)

| File | Role |
|------|------|
| `rov-overview-page.tsx` | Dashboard landing |
| `rov-projects-list-page.tsx` | Project index with filters |
| `rov-project-form.tsx` | Create / edit project |
| `rov-project-detail-page.tsx` | Project workspace — summary + section dropdown |
| `rov-project-summary.tsx` | Read-only project info panels |
| `rov-project-image-upload.tsx` | Single plan-view image upload |
| `manage-*-tab.tsx` | Structures, observations, media, reports tabs |

### API (`apps/api/src/rov-inspection/`)

- Projects CRUD: `rov-projects.controller.ts` / `rov-projects.service.ts`
- Media, points, views, reports: `rov-inspection.service.ts`
- Uploads: `rov-uploads.service.ts` (local) + `s3.service.ts` (multipart)
- All data scoped by `organizationId` from session

### API client

- `apps/web/src/lib/rov-api.ts`
- Types: `apps/web/src/types/rov.ts`

### Database

- Schema: `packages/db/src/schema/rov-inspection.ts`
- Migrations: `packages/db/drizzle/`
- Boot apply: `packages/db/src/apply-rov-inspection.ts`

### Project form sections (match frog)

1. **Project Information** — name, description  
2. **Details** — site location, client (`CustomerPicker`), dates  
3. **GPS Location** — latitude, longitude  
4. **Plan View** — single image upload  
5. **Status & Assignment** — status (`Select`), company (read-only from `getCompanySettings()`)

### Project detail page

- Compact hero card; **Project details** button toggles full summary
- Workspace navigation via **Polaris `Tabs`** (Structures, Observations, Media, Reports)
- Sync section to URL: `?tab=structures`
- Structures: `IndexTable` + **Add structure** modal

## Commands

```bash
pnpm dev:api          # API on :3001
pnpm dev:web          # Web on :3000
cd packages/db && pnpm build   # Rebuild DB types after schema changes
```

## Conventions

- Minimize diff scope; match surrounding code style
- Do not commit unless asked
- Rebuild `@frog1/db` after schema changes before typechecking API
- Reference frog Filament resources for field labels and section names when porting ROV UX
