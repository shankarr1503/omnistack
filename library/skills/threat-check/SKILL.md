---
name: threat-check
description: Security review of code or a change for exploitable vulnerabilities. Use when asked about security, before shipping auth, payments, file handling, user input, APIs or infrastructure changes, or when reviewing untrusted-input paths. Traces attacker-controlled data to dangerous sinks and reports only demonstrable issues.
---

# Threat check

Security review is about one question: **can an attacker make this code do something it should not?** Answer it by tracing data, not by pattern-matching scary function names.

## 1. Model the system (5 minutes)

- **Assets:** what is worth stealing or breaking (user data, credentials, money, admin actions, availability).
- **Entry points:** HTTP handlers, CLI args, file uploads, webhooks, queue consumers, environment, config files, third-party responses.
- **Trust boundaries:** where data crosses from less trusted to more trusted (browser → server, tenant → shared service, user → admin, internet → internal network).

## 2. Trace sources to sinks

For each entry point, follow attacker-controlled values to these sinks and check the defense at each:

| Sink              | Look for                                                                         | Correct defense                                                            |
| ----------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| SQL / NoSQL query | string concatenation, f-strings, `$where`                                        | parameterised queries, ORM bindings                                        |
| Shell / process   | `exec`, `system`, `shell=True`, backticks                                        | argument arrays, no shell, allowlist                                       |
| File system       | user value in a path                                                             | canonicalise + check inside base dir; reject symlinks                      |
| HTML / templates  | `innerHTML`, `dangerouslySetInnerHTML`, Jinja `safe` filter, unescaped templates | context-aware escaping, CSP                                                |
| Outbound URL      | fetching a user-supplied URL                                                     | allowlist hosts; block private/link-local IPs incl. after redirects (SSRF) |
| Redirects         | `redirect(req.query.next)`                                                       | relative paths or allowlist                                                |
| Deserialisation   | `pickle`, `yaml.load`, Java/PHP native deserialise                               | safe loaders, schemas                                                      |
| Crypto            | custom crypto, `md5`/`sha1` for passwords, static IVs, `Math.random` for tokens  | vetted libraries, argon2/bcrypt/scrypt, CSPRNG                             |
| Logs / errors     | secrets, tokens, PII, stack traces to users                                      | redaction, generic errors                                                  |

## 3. Check access control

Most real-world breaches here are boring:

- Every state-changing or data-returning endpoint checks **authentication** and **authorization for this specific object** (no IDOR: `GET /invoices/123` must verify the invoice belongs to the caller's tenant/user).
- Authorization is enforced server-side, not just hidden in the UI.
- Sessions/tokens: expiry, rotation on login/privilege change, revocation, secure cookie flags, CSRF protection for cookie auth.
- Rate limits on login, signup, password reset, OTP and expensive endpoints.

## 4. Check secrets and supply chain

- No credentials, keys or tokens in code, tests, fixtures, git history, or client bundles. Search history with tools that report commit and path without printing the value (`git log --all --format=%h --name-only -S 'BEGIN PRIVATE KEY'`, gitleaks, trufflehog), so the check does not leak the secret into logs.
- New dependencies: maintained, expected name (typosquats), pinned via lockfile. Run the ecosystem's audit (`npm audit`, `pip-audit`, `cargo audit`, `govulncheck`) and report results.
- CI: no secrets exposed to untrusted pull requests; actions pinned.

## Report only what you can demonstrate

For each finding give a concrete exploit scenario. No scenario, no finding — list it under "hardening suggestions" instead.

```
[Critical|High|Medium|Low] <title> — path:line
  Attack:  <who sends what, through which entry point>
  Result:  <what they gain>
  Fix:     <specific change; prefer the safer default>
```

Then: entry points reviewed, areas not reviewed, and tools run with results. Never claim code is "secure" — say what was checked.
