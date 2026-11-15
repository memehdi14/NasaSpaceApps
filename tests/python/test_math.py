import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipelines"))
import earthpulse_math as m  # noqa: E402


def test_db_doubling_is_3db():
    assert m.delta_db(0.02, 0.04) == pytest.approx(3.0103, abs=1e-4)


def test_db_rejects_nonpositive_and_nan():
    out = m.power_to_db([0.0, -1.0, np.nan, 1.0])
    assert np.isnan(out[:3]).all() and out[3] == 0.0


def test_water_candidate_keeps_unknown():
    out = m.water_candidate([-20, -10, np.nan], -17)
    assert out[0] == 1 and out[1] == 0 and np.isnan(out[2])


def test_change_classes():
    c = m.change_classes([1, 1, 0, 0, np.nan], [1, 0, 1, 0, 1])
    assert list(c) == [1, 2, 3, 0, 4]


def test_area_uses_metres_not_degrees():
    a = m.cell_area_km2(23.0, 0.002, 0.002)
    assert 0.04 < a < 0.05


def test_persistence_two_dates_values():
    out = m.water_persistence([[1, 1, 0, np.nan], [1, 0, 0, np.nan]])
    assert list(out[:3]) == [1.0, 0.5, 0.0] and np.isnan(out[3])


def test_phase_to_los_one_radian():
    assert float(m.phase_to_los_m(1.0, 0.24)) * 1000 == pytest.approx(19.099, abs=1e-3)


def test_wrap_phase_range():
    w = m.wrap_phase(np.linspace(-20, 20, 101))
    assert (w >= -np.pi).all() and (w < np.pi).all()


def test_coherence_noise_decreases_with_gamma():
    assert m.phase_std_from_coherence(0.9, 20) < m.phase_std_from_coherence(0.3, 20)


def test_single_pair_rate_is_refused():
    with pytest.raises(ValueError):
        m.weighted_velocity([0, 12], [0, 1], [1, 1])


def test_weighted_velocity_recovers_slope():
    t = np.arange(0, 120, 12.0)
    assert m.weighted_velocity(t, 0.05 * t + 2, np.ones_like(t)) == pytest.approx(0.05)


def test_boundary_uncertainty():
    assert m.boundary_area_uncertainty(1000, 10) == pytest.approx(10000 + math.pi * 100)
