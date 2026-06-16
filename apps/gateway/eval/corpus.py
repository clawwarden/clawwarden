"""Labeled evaluation corpus for PII detection.

Each example: {"text": str, "entities": [{"type": <canonical>, "value": <substring>}]}
Entity types use the gateway's canonical names (see gateway/tokenizer.ENTITY_SHORT).
Negatives (empty "entities") are analytics-safe fields that MUST NOT be flagged —
a false positive there destroys analytics utility (money, rates, geography).

⛔ This is a SOTA scaffold. Before publishing an SLO, validate against real
   (consented, de-identified) customer-shaped data and expand volume per type.
"""

from typing import Any

LABELED_CORPUS: list[dict[str, Any]] = [
    # ── PERSON (NER) ──
    {"text": "Borrower Jane Smith requested a payment deferral.", "entities": [{"type": "PERSON", "value": "Jane Smith"}]},
    {"text": "Account manager Michael Rodriguez approved the increase.", "entities": [{"type": "PERSON", "value": "Michael Rodriguez"}]},
    {"text": "Co-signers David Lee and Sarah Connor are both current.", "entities": [{"type": "PERSON", "value": "David Lee"}, {"type": "PERSON", "value": "Sarah Connor"}]},
    {"text": "Call from Priya Patel regarding her mortgage.", "entities": [{"type": "PERSON", "value": "Priya Patel"}]},
    # ── SSN ──
    {"text": "SSN: 123-45-6789 on the application.", "entities": [{"type": "SSN", "value": "123-45-6789"}]},
    {"text": "Social Security 987-65-4321 verified.", "entities": [{"type": "SSN", "value": "987-65-4321"}]},
    {"text": "Taxpayer ID 555 12 3456 was provided.", "entities": [{"type": "SSN", "value": "555 12 3456"}]},
    # ── EMAIL ──
    {"text": "Send the statement to jane.smith@example.com please.", "entities": [{"type": "EMAIL_ADDRESS", "value": "jane.smith@example.com"}]},
    {"text": "Contact: m.rodriguez@bank-corp.co.uk for follow-up.", "entities": [{"type": "EMAIL_ADDRESS", "value": "m.rodriguez@bank-corp.co.uk"}]},
    # ── PHONE ──
    {"text": "Reach the borrower at (415) 555-0132.", "entities": [{"type": "PHONE_NUMBER", "value": "(415) 555-0132"}]},
    {"text": "Mobile 212-555-7788 listed as primary.", "entities": [{"type": "PHONE_NUMBER", "value": "212-555-7788"}]},
    # ── CREDIT_CARD ──
    {"text": "Card on file 4111 1111 1111 1111 expires soon.", "entities": [{"type": "CREDIT_CARD", "value": "4111 1111 1111 1111"}]},
    {"text": "Charged to 5500-0000-0000-0004 last cycle.", "entities": [{"type": "CREDIT_CARD", "value": "5500-0000-0000-0004"}]},
    # ── ACCOUNT_NUMBER ──
    {"text": "Account: 0012345678 shows a positive balance.", "entities": [{"type": "ACCOUNT_NUMBER", "value": "Account: 0012345678"}]},
    {"text": "Acct #00198234 flagged for review.", "entities": [{"type": "ACCOUNT_NUMBER", "value": "Acct #00198234"}]},
    {"text": "Funds moved to ACC-0019823 overnight.", "entities": [{"type": "ACCOUNT_NUMBER", "value": "ACC-0019823"}]},
    {"text": "ACCT-001234 is delinquent.", "entities": [{"type": "ACCOUNT_NUMBER", "value": "ACCT-001234"}]},
    # ── ROUTING_NUMBER ──
    {"text": "Routing: 021000021 for the wire.", "entities": [{"type": "ROUTING_NUMBER", "value": "Routing: 021000021"}]},
    {"text": "ABA 011000015 on the deposit slip.", "entities": [{"type": "ROUTING_NUMBER", "value": "ABA 011000015"}]},
    {"text": "RTN: 026009593 confirmed by the bank.", "entities": [{"type": "ROUTING_NUMBER", "value": "RTN: 026009593"}]},
    # ── LOAN_ID ──
    {"text": "LOAN-2024-0041 entered default status.", "entities": [{"type": "LOAN_ID", "value": "LOAN-2024-0041"}]},
    {"text": "Reference Loan: XYZ-001 in the notes.", "entities": [{"type": "LOAN_ID", "value": "Loan: XYZ-001"}]},
    # ── DATE_TIME (DOB etc.) ──
    {"text": "Date of birth 04/12/1985 on record.", "entities": [{"type": "DATE_TIME", "value": "04/12/1985"}]},
    {"text": "Opened the account on January 5, 2020.", "entities": [{"type": "DATE_TIME", "value": "January 5, 2020"}]},
    # ── Mixed (multiple types in one record) ──
    {"text": "Jane Smith (SSN 123-45-6789) called from (415) 555-0132 about ACC-0019823.",
     "entities": [{"type": "PERSON", "value": "Jane Smith"}, {"type": "SSN", "value": "123-45-6789"},
                  {"type": "PHONE_NUMBER", "value": "(415) 555-0132"}, {"type": "ACCOUNT_NUMBER", "value": "ACC-0019823"}]},
    {"text": "Email david.lee@example.com, card 4111 1111 1111 1111, loan LOAN-2024-0041.",
     "entities": [{"type": "EMAIL_ADDRESS", "value": "david.lee@example.com"}, {"type": "CREDIT_CARD", "value": "4111 1111 1111 1111"},
                  {"type": "LOAN_ID", "value": "LOAN-2024-0041"}]},
    # ── Negatives — analytics-safe, MUST NOT be flagged ──
    {"text": "The outstanding balance is $12,345.67.", "entities": []},
    {"text": "Interest rate is 4.25% APR.", "entities": []},
    {"text": "Branch located in Chicago, Illinois.", "entities": []},
    {"text": "Days past due: 30.", "entities": []},
    {"text": "Credit score improved to 742 this quarter.", "entities": []},
    {"text": "Monthly payment of 1,250 dollars.", "entities": []},
    {"text": "Loan-to-value ratio is 0.82.", "entities": []},
    {"text": "Portfolio grew four percent year over year.", "entities": []},
    {"text": "Risk tier B, employment status full-time.", "entities": []},
    {"text": "Term length is 360 months.", "entities": []},
]
