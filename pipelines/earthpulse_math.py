"""Reference implementation of the Earth Pulse formulas (plan sections 8-10).

Mirrors src/earth-pulse/math.js so the pipeline and the browser agree.
Missing values are NaN, never zero.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np


def power_to_db(p):
    p = np.asarray(p, dtype=float)
    out = np.full(p.shape, np.nan)
    ok = np.isfinite(p) & (p > 0)
    out[ok] = 10.0 * np.log10(p[ok])
    return out


def delta_db(p1, p2):
    return power_to_db(p2) - power_to_db(p1)


def water_candidate(db, tau):
    db = np.asarray(db, dtype=float)
    out = np.where(db < tau, 1.0, 0.0)
    out[~np.isfinite(db)] = np.nan
    return out


# change classes: 0 neither, 1 persistent, 2 lost (date 1 only), 3 new (date 2 only), 4 unknown
def change_classes(w1, w2):
    w1 = np.asarray(w1, dtype=float)
    w2 = np.asarray(w2, dtype=float)
    out = np.zeros(w1.shape, dtype=np.uint8)
    out[(w1 == 1) & (w2 == 1)] = 1
    out[(w1 == 1) & (w2 == 0)] = 2
    out[(w1 == 0) & (w2 == 1)] = 3
    out[~np.isfinite(w1) | ~np.isfinite(w2)] = 4
    return out


def cell_area_km2(lat_deg: float, dx_deg: float, dy_deg: float) -> float:
    return dx_deg * 111.32 * math.cos(math.radians(lat_deg)) * dy_deg * 110.574


def water_persistence(stack):
    stack = np.asarray(stack, dtype=float)
    valid = np.isfinite(stack)
    n = valid.sum(axis=0)
    water = np.where(valid, stack, 0).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0, water / n, np.nan)


def boundary_area_uncertainty(length_m: float, eps_m: float) -> float:
    return length_m * eps_m + math.pi * eps_m ** 2


def phase_to_los_m(phase_rad, wavelength_m):
    return wavelength_m / (4 * math.pi) * np.asarray(phase_rad, dtype=float)


def wrap_phase(phi):
    phi = np.asarray(phi, dtype=float)
    return (phi + np.pi) % (2 * np.pi) - np.pi


def phase_std_from_coherence(gamma: float, looks: float) -> float:
    if not (0 < gamma <= 1) or looks <= 0:
        return math.nan
    return math.sqrt((1 - gamma ** 2) / (2 * looks * gamma ** 2))


def weighted_velocity(t: Sequence[float], d: Sequence[float], w: Sequence[float]):
    t, d, w = (np.asarray(x, dtype=float) for x in (t, d, w))
    ok = np.isfinite(t) & np.isfinite(d) & np.isfinite(w) & (w > 0)
    t, d, w = t[ok], d[ok], w[ok]
    if t.size < 3:
        raise ValueError("At least three dated observations are required; one pair cannot establish a rate.")
    tb = np.sum(w * t) / np.sum(w)
    db = np.sum(w * d) / np.sum(w)
    den = np.sum(w * (t - tb) ** 2)
    if den == 0:
        raise ValueError("All observations share one date.")
    return float(np.sum(w * (t - tb) * (d - db)) / den)
