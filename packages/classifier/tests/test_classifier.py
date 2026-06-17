from clawwarden import (
    Classifier,
    ClassificationResult,
    DataSensitivity,
    RegexNerPipeline,
    max_sensitivity,
)


def test_ssn_is_restricted():
    result = Classifier().classify("SSN 123-45-6789 on file")
    assert result.sensitivity == DataSensitivity.RESTRICTED
    assert "SSN" in result.tags


def test_email_is_confidential():
    result = Classifier().classify("email jane@acme.com")
    assert result.sensitivity == DataSensitivity.CONFIDENTIAL
    assert "EMAIL" in result.tags


def test_clean_text_is_public():
    result = Classifier().classify("average portfolio balance grew 4%")
    assert result.sensitivity == DataSensitivity.PUBLIC
    assert result.entities == []


def test_takes_max_of_multiple_entities():
    # email (confidential) + SSN (restricted) -> restricted
    result = Classifier().classify("jane@acme.com SSN 123-45-6789")
    assert result.sensitivity == DataSensitivity.RESTRICTED
    assert len(result.entities) == 2


def test_max_sensitivity_helper():
    assert (
        max_sensitivity(
            [DataSensitivity.PUBLIC, DataSensitivity.RESTRICTED, DataSensitivity.INTERNAL]
        )
        == DataSensitivity.RESTRICTED
    )
    assert max_sensitivity([]) == DataSensitivity.PUBLIC


def test_pipeline_is_swappable():
    class AlwaysRestricted:
        def classify(self, text: str) -> ClassificationResult:
            return ClassificationResult(sensitivity=DataSensitivity.RESTRICTED)

    clf = Classifier(pipeline=AlwaysRestricted())
    assert clf.classify("anything").sensitivity == DataSensitivity.RESTRICTED


def test_regex_pipeline_reports_offsets():
    result = RegexNerPipeline().classify("x ACC-001982 y")
    assert result.entities[0].type == "ACCOUNT"
    assert result.entities[0].start == 2
