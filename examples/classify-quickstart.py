"""Data-sensitivity classification with the `clawwarden` package.

Run after `pip install -e packages/classifier`:
    python examples/classify-quickstart.py
"""

from clawwarden import Classifier

clf = Classifier()

samples = [
    "average portfolio balance grew 4% this quarter",
    "contact jane@acme.com about the renewal",
    "customer SSN 123-45-6789, account ACC-00198234",
]

for text in samples:
    result = clf.classify(text)
    print(f"\n> {text}")
    print(f"  sensitivity: {result.sensitivity.value}")
    print(f"  entities: {[e.type for e in result.entities]}")
