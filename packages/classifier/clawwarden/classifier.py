"""Data-sensitivity classification (Gap 7).

Open interface (`Pipeline`, `Classifier`) + a reference regex/NER pipeline. The
a custom semantic classifier — and the BFSI sensitivity *taxonomy* —
implement the same `Pipeline` protocol and plug in unchanged.

⛔ The entity → sensitivity mapping below is a SOTA *placeholder*. The real BFSI
   taxonomy (what counts as confidential vs restricted, MNPI, legal privilege)
   is founder IP and should replace it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol, runtime_checkable


class DataSensitivity(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


_ORDER: dict[DataSensitivity, int] = {
    DataSensitivity.PUBLIC: 0,
    DataSensitivity.INTERNAL: 1,
    DataSensitivity.CONFIDENTIAL: 2,
    DataSensitivity.RESTRICTED: 3,
}


def max_sensitivity(levels: list[DataSensitivity]) -> DataSensitivity:
    """Return the most sensitive level (defaults to PUBLIC for empty input)."""
    out = DataSensitivity.PUBLIC
    for level in levels:
        if _ORDER[level] > _ORDER[out]:
            out = level
    return out


@dataclass
class Entity:
    type: str
    start: int
    end: int


@dataclass
class ClassificationResult:
    sensitivity: DataSensitivity
    entities: list[Entity] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


@runtime_checkable
class Pipeline(Protocol):
    """A classification pipeline. Implement this to bring your own model."""

    def classify(self, text: str) -> ClassificationResult: ...


# (entity type, pattern, sensitivity) — reference placeholder taxonomy.
_PATTERNS: list[tuple[str, re.Pattern[str], DataSensitivity]] = [
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), DataSensitivity.RESTRICTED),
    ("ACCOUNT", re.compile(r"\bACC-\d{6,12}\b"), DataSensitivity.RESTRICTED),
    ("CREDIT_CARD", re.compile(r"\b(?:\d[ -]?){13,16}\b"), DataSensitivity.RESTRICTED),
    ("EMAIL", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), DataSensitivity.CONFIDENTIAL),
    ("PHONE", re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b"), DataSensitivity.CONFIDENTIAL),
    ("LOAN_ID", re.compile(r"\bLOAN-\d{4}-\d{3,6}\b"), DataSensitivity.CONFIDENTIAL),
]


class RegexNerPipeline:
    """Reference, dependency-free pipeline. Open baseline, not a complete model."""

    def classify(self, text: str) -> ClassificationResult:
        entities: list[Entity] = []
        tags: list[str] = []
        levels: list[DataSensitivity] = []
        for etype, pattern, esev in _PATTERNS:
            for m in pattern.finditer(text):
                entities.append(Entity(type=etype, start=m.start(), end=m.end()))
                levels.append(esev)
                if etype not in tags:
                    tags.append(etype)
        return ClassificationResult(
            sensitivity=max_sensitivity(levels), entities=entities, tags=tags
        )


class Classifier:
    """Classify text sensitivity using a pluggable pipeline."""

    def __init__(self, pipeline: Pipeline | None = None) -> None:
        self._pipeline: Pipeline = pipeline or RegexNerPipeline()

    def classify(self, text: str) -> ClassificationResult:
        return self._pipeline.classify(text)
