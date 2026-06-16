from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass, field
from typing import List, Tuple, Dict

import structlog

log = structlog.get_logger()

# Short code used in token names, e.g. {{PERSON_1}}, {{SSN_1}}
#
# BANKING ANALYTICS DESIGN:
#   TOKENIZED  — identity fields that directly identify a natural person (GDPR Art.4 / GLBA)
#   PRESERVED  — analytics dimensions (amounts, rates, scores, categories, geography)
#
# NOT tokenized (analytics-safe): balances, credit scores, interest rates, monthly payments,
# days-past-due, risk flags, loan types, employment status, collateral, city, state.
# These are needed for aggregation and statistical analysis.
#
ENTITY_SHORT: Dict[str, str] = {
    # Identity / direct identifiers — ALWAYS tokenize
    "PERSON": "PERSON",
    "SSN": "SSN",
    "ACCOUNT_NUMBER": "ACCT",
    "ROUTING_NUMBER": "ROUTING",
    "LOAN_ID": "LOAN",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "DATE_TIME": "DATE",       # covers Date of Birth (PII per GLBA / CCPA)
    "CREDIT_CARD": "CARD",
    # CURRENCY / MONEY intentionally excluded — financial amounts are analytics data
    # LOCATION intentionally excluded — city/state are analytics dimensions, not direct identifiers
}

ALL_ENTITIES = list(ENTITY_SHORT.keys())


def _build_analyzer() -> AnalyzerEngine:
    # Heavy NER stack imported lazily: keeps the module importable without
    # Presidio/spaCy present, and avoids the multi-second model load at process
    # startup (the analyzer is built on first tokenize call only).
    from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    ssn_recognizer = PatternRecognizer(
        supported_entity="SSN",
        patterns=[
            Pattern("SSN_DASH", r"\b\d{3}-\d{2}-\d{4}\b", 0.95),
            Pattern("SSN_SPACE", r"\b\d{3} \d{2} \d{4}\b", 0.85),
        ],
    )
    account_recognizer = PatternRecognizer(
        supported_entity="ACCOUNT_NUMBER",
        patterns=[
            # Matches: ACC-00198234, ACCT-001234, Account: 0012345678
            Pattern(
                "ACCOUNT_LABELED",
                r"(?i)\b(?:account|acct|acc)[\s#:\-]*\d{6,17}\b",
                0.9,
            ),
            # Matches standalone ACC-XXXXXXX format used in CSV exports
            Pattern(
                "ACCOUNT_ACC_PREFIX",
                r"\bACC-\d{7,12}\b",
                0.92,
            ),
        ],
    )
    routing_recognizer = PatternRecognizer(
        supported_entity="ROUTING_NUMBER",
        patterns=[
            Pattern(
                "ROUTING_LABELED",
                r"(?i)\b(?:routing|aba|rtn)[\s#:]*\d{9}\b",
                0.95,
            ),
        ],
    )
    loan_recognizer = PatternRecognizer(
        supported_entity="LOAN_ID",
        patterns=[
            # Matches: LOAN-2024-0041, LOAN-ABC123, loan: XYZ001
            Pattern(
                "LOAN_LABELED",
                r"(?i)\b(?:loan|loan_id|loan-id)[\s#:\-]*[A-Z0-9][A-Z0-9\-]{4,19}\b",
                0.9,
            ),
            # Matches standalone LOAN-YYYY-NNNN format used in CSV exports
            Pattern(
                "LOAN_YEAR_FORMAT",
                r"\bLOAN-\d{4}-\d{3,6}\b",
                0.92,
            ),
        ],
    )

    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
        }
    )
    nlp_engine = provider.create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
    analyzer.registry.add_recognizer(ssn_recognizer)
    analyzer.registry.add_recognizer(account_recognizer)
    analyzer.registry.add_recognizer(routing_recognizer)
    analyzer.registry.add_recognizer(loan_recognizer)
    return analyzer


_analyzer: AnalyzerEngine | None = None


def get_analyzer() -> AnalyzerEngine:
    global _analyzer
    if _analyzer is None:
        log.info("loading_presidio_analyzer")
        _analyzer = _build_analyzer()
        log.info("presidio_analyzer_ready")
    return _analyzer


@dataclass
class EntityResult:
    entity_type: str
    token: str
    original: str
    start: int
    end: int

    def to_dict(self) -> dict:
        return {
            "entity_type": self.entity_type,
            "token": self.token,
            "start": self.start,
            "end": self.end,
        }


def _stable_hash(session_id: str, entity_type: str, value: str) -> str:
    raw = f"{session_id}:{entity_type}:{value}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


@dataclass
class DetectedSpan:
    entity_type: str
    start: int
    end: int
    score: float


def analyze_spans(text: str, score_threshold: float = 0.4) -> List[DetectedSpan]:
    """Detect PII spans with the production analyzer + overlap dedup (sync).

    This is the single source of truth for *what counts as PII* — both
    ``run_tokenize`` and the offline eval harness call it, so measured recall is
    the recall of the real pipeline. Returns spans sorted by start (descending),
    ready for right-to-left replacement.
    """
    analyzer = get_analyzer()
    results = analyzer.analyze(
        text=text, language="en", entities=ALL_ENTITIES, score_threshold=score_threshold
    )
    # Remove overlapping spans (keep highest-score).
    deduped = []
    covered: set[int] = set()
    for r in sorted(results, key=lambda r: r.score, reverse=True):
        span = set(range(r.start, r.end))
        if not span & covered:
            deduped.append(r)
            covered |= span
    deduped.sort(key=lambda r: r.start, reverse=True)
    return [DetectedSpan(r.entity_type, r.start, r.end, r.score) for r in deduped]


async def run_tokenize(
    text: str,
    session_id: str,
    store,  # SessionStore — avoids circular import
) -> Tuple[str, List[EntityResult], Dict[str, str]]:
    """
    Detect PII in `text` and replace with deterministic tokens.
    Returns:
        tokenized_text: string with tokens in place of PII
        entity_results: list of what was found
        new_token_map: {token -> real_value} — must be merged into session store
    """
    # DB7: Presidio + spaCy NER is CPU-bound work. Running it synchronously inside
    # an async handler blocks the event loop for the full NER duration, serialising
    # every concurrent request behind spaCy. run_in_executor offloads to the default
    # ThreadPoolExecutor so the loop remains free for I/O while NER runs.
    loop = asyncio.get_event_loop()
    deduped = await loop.run_in_executor(None, lambda: analyze_spans(text))

    entity_results: List[EntityResult] = []
    new_token_map: Dict[str, str] = {}
    tokenized = text

    for result in deduped:
        original_value = text[result.start : result.end]
        entity_type = result.entity_type
        if entity_type == "MONEY":
            entity_type = "CURRENCY"

        short = ENTITY_SHORT.get(entity_type, entity_type)
        val_hash = _stable_hash(session_id, entity_type, original_value)

        token = await store.get_or_create_token_for_hash(
            session_id, val_hash, entity_type, short
        )

        new_token_map[token] = original_value
        entity_results.append(
            EntityResult(entity_type, token, original_value, result.start, result.end)
        )
        tokenized = tokenized[: result.start] + token + tokenized[result.end :]

    log.info(
        "tokenized",
        session_id=session_id,
        entities=len(entity_results),
    )
    return tokenized, entity_results, new_token_map
