# Security policy

## Supported scope

The maintained Ghost Busters investigation skill and its bundled scanners,
evidence gates and synthetic demonstrations on the default branch receive
security review. Earlier releases and arbitrary forks are not automatically
covered. This is **not** a vulnerability scanner certification or a guarantee
of production safety.

## Reporting a vulnerability

Please use **GitHub private vulnerability reporting**, if enabled:
[Start a private advisory](https://github.com/RakamakadoN/ghost-busters-skill/security/advisories/new).

If GitHub does not offer this private form, contact the maintainer through an
already established **private** channel before sending sensitive details.
Do **not** publish proof-of-concept exploits, customer data, access tokens,
private source code or undisclosed security issues in a public issue,
discussion or pull request. This repository does not publish a dedicated
security-response email address; do not infer one from commit metadata.

Include a non-sensitive summary, affected version/commit, conditions and
reproduction steps, impact and a safe means to follow up. Use sanitized
synthetic artifacts when possible. No production account access, destructive
tests or exploit attempts are authorized by this policy.

Maintainers will triage privately, verify the affected scope and coordinate
a remediation/advisory when appropriate. **No fixed response SLA is
promised**, and private report submission does not mean an issue is confirmed.

## Evidence and permissions

Ghost Busters outputs are hypotheses until checked against the relevant
system's contract and independently observed evidence. Never turn a pattern
match into a verified security vulnerability, claim a CVE, or disclose
another project's issue without following its own security policy.
Static scanning is read-only; do not run arbitrary target code under
ambient credentials or bypass privacy/security controls.
