"""Vaultex open SDK — data-sensitivity classification + Governance Service client."""

from vaultex.classifier import (
    Classifier,
    ClassificationResult,
    DataSensitivity,
    Entity,
    Pipeline,
    RegexNerPipeline,
    max_sensitivity,
)
from vaultex.governance import GovernanceClient

__all__ = [
    "Classifier",
    "ClassificationResult",
    "DataSensitivity",
    "Entity",
    "Pipeline",
    "RegexNerPipeline",
    "max_sensitivity",
    "GovernanceClient",
]

__version__ = "0.1.0"
