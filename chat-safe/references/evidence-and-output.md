# Evidence gate and report template

## Evidence boundaries

- **E0 / SUSPECTED:** structural or conversational candidate only.
- **E1 / STRONG_EVIDENCE:** separately identified corroborating source sites;
  a single analysis copied twice does not establish independence.
- **E2 / CONFIRMED:** independently reviewed contract and actual authorized
  code/dependency reproduction in an isolated environment with passing
  negative control. Chat-Safe alone does **not** provide E2.
- **E3 / E4:** further independent reviewer and verified target artifact;
  cannot follow merely from model agreement.

For Chat-Safe output, keep a separate ANALYSIS_LEVEL=CHAT_ONLY tag so
downstream systems cannot mistake a formatted report for a tool attestation.

## Mandatory finding record (repeat per finding)

| Field | Value |
| --- | --- |
| Source revision / scope | exact provided SHA/path, or UNVERIFIED |
| Code anchor | file:line from visible text, or UNVERIFIED |
| Contract and origin | quoted user requirement, schema, or INFERRED |
| Trigger | specific inputs and preconditions, or UNKNOWN |
| Expected behavior | explicit asserted invariant, or UNKNOWN |
| Derived code behavior | steps grounded in visible source, or UNKNOWN |
| Runtime observation | NOT_OBSERVED unless verified external evidence supplied |
| Proposed falsifier | exact control/case that could disprove candidate |
| Status / level | E0 SUSPECTED by default |
| Reproduction | NOT_RUN; required safe test and dependency blocker |
| Coverage | file inventory seen, skipped files and budget |

Output includes a top-level **coverageStatus**: COMPLETE_FOR_DECLARED_SCOPE
only when every declared source was actually read, otherwise PARTIAL.
Never say CLEAN on an unread or unsupported scope. Include security
disclosure route instead of public exploit details for potential vulnerabilities.
