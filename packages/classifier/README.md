# clawwarden (Python)

Data-sensitivity classification + Governance Service client for the ClawWarden stack.

> Pre-release: not yet on PyPI. Install from source:
> `git clone https://github.com/clawwarden/clawwarden && pip install -e packages/classifier`

## Classify before you send to an LLM

```python
from clawwarden import Classifier

clf = Classifier()                         # reference regex/NER pipeline
r = clf.classify("Wire to Jane, SSN 123-45-6789")
print(r.sensitivity)   # DataSensitivity.RESTRICTED
print(r.tags)          # ['SSN']
```

### Bring your own pipeline

```python
from clawwarden import Classifier, ClassificationResult, DataSensitivity

class SemanticPipeline:
    def classify(self, text: str) -> ClassificationResult:
        ...  # your model / a custom pipeline

clf = Classifier(pipeline=SemanticPipeline())
```

## Ship audit + evidence to the Governance Service

```python
from clawwarden import GovernanceClient

gov = GovernanceClient(base_url="https://gov.example.com", api_key="...")
await gov.append_audit_event(
    event_type="pii_detected", reason="restricted data in prompt", confidence=0.95,
    payload={"tags": ["SSN"]},
)
```

The client is **best-effort**: a governance outage never breaks your request path, and it no-ops
when unconfigured.

## Open source

The reference classifier and its entity→sensitivity mapping are an open baseline. The proprietary
**semantic sensitivity model** and the **BFSI taxonomy** implement the same `Pipeline` protocol.

Apache-2.0.
