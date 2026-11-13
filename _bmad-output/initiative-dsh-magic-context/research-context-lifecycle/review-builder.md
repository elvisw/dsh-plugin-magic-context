# Independent builder check

Fresh deepseek-v4.1-flash reviewer read the design without the author. Returned planning questions, ordered by impact. This is a draft-readiness check, not approval of code or V1 scope.

| Question | Disposition |
|---|---|
| Is the next plan stage0-only, and when may implementation start? | Clarified: propose stage0 only; design approval permits writing a plan, not immediate DSH modification. Do not adopt the reviewer's inference that all validation code must be disposable. |
| What passes, and are real-provider credentials/spend required? | Add exact invariant checks for controlled fixtures. Offline evidence is proposed first; real-provider claims remain unproven and require separate authorization. Latency/cache-hit targets are not invented to fill a qualitative research slice. |
| Must final storage and cross-store reconciliation already be proved? | Stage0 cannot claim restart correctness without tested durable replay/reconciliation. Protocol remains a builder decision; final storage location/sharing model can wait. |
| Which runtime/platform, and must it be installable? | Propose local Windows installed DSH 0.2.2-rc.1 as target, fixed source as reference, isolated test session/profile only. Full distribution/support matrix deferred; no production-session install is authorized. |
| What happens if the plugin is disabled? | User-visible decision remains open: valid raw-log access without automatic expansion versus automatic restoration of the visible context. Any approach must not strand cold sessions behind an unavailable required interpreter. |
| Text/JSON only, or binary attachments too? | Explicit scope proposal: text/JSON first; binary attachment recovery excluded from the first validation, not removed from future needs. User approval still needed. |

Cross-harness data sharing, final project-storage goals, public release and Historian/memory/UI sequence can wait. Module closure, vendoring layout, idempotency protocol, fixtures and rollback stay with the later plan rather than becoming new questions for the user.
