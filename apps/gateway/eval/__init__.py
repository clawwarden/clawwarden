"""Offline PII-detection evaluation harness.

Measures the production detector's precision/recall/F1 per entity type, the
residual-leak rate (the product SLO: fraction of real PII values that survive
tokenization), and per-request latency. See run_eval.py.
"""
