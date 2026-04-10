---
name: implement-volumetrica
description: Implement a Volumetrica API endpoint in the provider layer, following the existing layered architecture patterns
argument-hint: <endpoint-path or tag, e.g. "Bulk/AccountsEnabled" or "TradingRule">
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, Agent]
---

Implement the Volumetrica API endpoint(s) specified by the user: $ARGUMENTS

The Volumetrica swagger spec lives at `C:\Users\justi\Downloads\volumetricaswagger.json`. Use this as the source of truth for endpoint paths, parameters, request bodies, and response schemas.

## Context

This project uses a **platform-agnostic provider pattern**:

- `src/providers/trading-platform.provider.ts` — the interface all platforms implement
- `src/providers/types.ts` — platform-agnostic DTOs (params and results)
- `src/providers/volumetrica/volumetrica.provider.ts` — Volumetrica-specific implementation
- `src/providers/volumetrica/volumetrica.client.ts` — low-level HTTP client (handles auth, retries, envelope unwrapping)

The client already handles `x-api-key` auth, `{ success, data }` envelope unwrapping, retries, and error mapping. You do NOT need to modify the client.

## Steps

### Step 1: Read the swagger spec

Read the swagger JSON to find the endpoint(s) matching `$ARGUMENTS`. Extract:
- HTTP method and full path
- Query parameters and request body schema
- Response schema (resolve all `$ref` references to get the actual field names and types)
- The summary/description for context

If `$ARGUMENTS` is a tag name (e.g., "Bulk", "TradingRule"), implement ALL endpoints under that tag. If it's a specific path (e.g., "Bulk/AccountsEnabled"), implement just that one.

### Step 2: Check what already exists

Read the current state of:
- `src/providers/trading-platform.provider.ts` — to see existing interface methods
- `src/providers/types.ts` — to see existing platform-agnostic types
- `src/providers/volumetrica/volumetrica.provider.ts` — to see existing implementation

Skip any endpoints that are already implemented. Report which ones are skipped.

### Step 3: Design platform-agnostic types

For each new endpoint, design types in `src/providers/types.ts` following the existing patterns:
- **Params interfaces** for inputs (e.g., `CreatePlatformUserParams`)
- **Result interfaces** for outputs (e.g., `PlatformAccountResult`)
- Use platform-agnostic names — no "Volumetrica" or "Vol" prefixes in these types
- Use `Date` for datetime fields, not strings
- Use `| undefined` for optional fields (matching the project's `exactOptionalPropertyTypes`)
- Reuse existing types where the data shape overlaps (e.g., if an endpoint returns accounts, reuse `PlatformAccountResult`)
- For paginated responses, include a `nextPageToken?: string | undefined` field in the result

### Step 4: Update the provider interface

Add new method signatures to `src/providers/trading-platform.provider.ts`:
- Group methods under a comment section matching existing style (e.g., `// -- Bulk Operations --`)
- Use descriptive method names that match the operation, not the endpoint path
- Add the import for any new types

### Step 5: Implement in Volumetrica provider

Add the implementation in `src/providers/volumetrica/volumetrica.provider.ts`:
- Define Volumetrica-specific response interfaces at the top (prefixed with `Vol`, e.g., `VolTradingRule`) matching the swagger response schemas exactly
- Use `this.client.get<T>()`, `this.client.post<T>()`, etc. — the client handles auth and envelope unwrapping
- Map Volumetrica response fields to platform-agnostic result types (the mapping layer)
- Use `const API = '/api/v2/Propsite'` prefix (already defined)
- Follow the exact same patterns as existing methods (logging, optional param spreading, date conversion)
- For paginated endpoints, handle the `nextPageToken` query parameter

### Step 6: Write tests

Create or update test file at `src/providers/volumetrica/__tests__/volumetrica.provider.test.ts`:
- Mock the `VolumetricaClient` methods
- Test each new method: correct API path called, params mapped correctly, response mapped to platform-agnostic types
- Test optional parameters are conditionally included
- Test error cases (client throws PlatformError)
- Follow existing test patterns if the file already exists

### Step 7: Verify

Run:
```bash
npm run typecheck
npx jest src/providers/volumetrica --passWithNoTests
```

Fix any issues before finishing.

## Important Rules

- **Never modify `volumetrica.client.ts`** — the HTTP layer is complete
- **All new types go in `src/providers/types.ts`** — keep them platform-agnostic
- **All imports use `.js` extensions** (NodeNext module resolution)
- **No `any` type** — use `unknown` for truly unknown data
- **Use `interface` over `type`** for object shapes
- **Explicit return types** on all functions
- **kebab-case file names**, **camelCase** functions/variables, **PascalCase** interfaces
- **Do NOT wire up routes or services** — this skill only handles the provider layer. The user will separately wire up service/route layers when needed.
- For bulk/paginated endpoints that return dictionaries keyed by account ID, use `Record<string, T[]>` or `Map<string, T[]>` as appropriate
