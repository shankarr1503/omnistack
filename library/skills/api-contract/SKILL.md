---
name: api-contract
description: Design or review an API (REST, GraphQL, gRPC, SDK or library interface) for clarity, consistency and long-term compatibility. Use when adding endpoints, changing request/response shapes, designing a public interface, or reviewing an API proposal.
---

# API contract

An API is a promise you will be held to for years. Design it for the caller, and make it hard to break.

## 1. Start from the caller

- Write the client code first: how will a caller use this for the main use case? If that code is awkward, the API is wrong.
- Match the existing API's conventions in this codebase (naming, casing, pagination, errors, auth, versioning) before any general best practice.

## 2. Shape

- **Resources and names:** nouns for resources, consistent plural/singular, consistent casing. Same concept, same name everywhere.
- **Operations:** correct HTTP methods and status codes (201 + location for create, 204 for empty success, 404 vs 403 deliberately, 409 for conflicts, 422/400 for validation). GraphQL: nullable by default where failure is possible; mutations return the changed object.
- **Inputs:** validate everything at the boundary; reject unknown fields or ignore them consistently; explicit units and formats (ISO-8601 UTC timestamps, currency as minor units + code, IDs as strings).
- **Outputs:** stable envelope; never leak internal fields, stack traces or database IDs you may want to change.
- **Errors:** machine-readable code + human message + details for field errors, the same shape for every endpoint (e.g. RFC 9457 problem details).
- **Collections:** pagination from day one (cursor-based for changing data), a max page size, stable sort order, filtering conventions.

## 3. Reliability

- **Idempotency:** `PUT`/`DELETE` idempotent; for `POST` that creates or charges, accept an idempotency key.
- **Concurrency:** ETags / version fields for optimistic locking on updates.
- **Limits:** rate limits with `429` + `Retry-After`; payload size limits; timeouts.
- **Long work:** return `202` with a status resource instead of holding the request open.

## 4. Security

Authentication on every endpoint unless deliberately public; object-level authorization (the caller owns _this_ record); no sensitive data in URLs; least-privilege scopes.

## 5. Compatibility

- **Safe:** adding optional request fields, adding response fields _only if_ clients tolerate unknown fields, adding endpoints, adding enum values _only if_ clients were told to tolerate unknown values.
- **Breaking:** removing/renaming fields, changing types or meaning, making optional fields required, changing defaults, changing error codes, tightening validation.
- Breaking changes need a new version or a deprecation period with signalling (docs, `Deprecation`/`Sunset` headers, logs of who still calls the old shape).

## Output

For a design: the endpoint/operation list with request/response examples and error cases. For a review: findings as `[Breaking|Major|Minor] location — issue — suggested change`, plus what is good and should be kept.
