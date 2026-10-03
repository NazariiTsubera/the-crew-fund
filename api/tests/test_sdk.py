"""Guards against the PyPI name collision: `statevector` on PyPI is an unrelated
quantum vector-database package. Ours must be the organizers' dataset SDK."""

import statevector


def test_statevector_is_the_organizers_dataset_sdk():
    assert hasattr(statevector, "Dataset")
    assert hasattr(statevector, "holdout_cutoff")
    assert hasattr(statevector, "parse_occ")
