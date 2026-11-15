import { describe, expect, it } from "vitest";
import { CHANGE, boundaryAreaUncertainty, cellAreaKm2, changeClass, deltaDb, phaseToLosMeters, powerToDb, waterCandidate, waterPersistence, weightedVelocity, wrapPhase } from "./math.js";
import { AOI, GCOV_DATES, GUNW_PAIRS } from "./config.js";
import { deriveStatus, moduleAvailability } from "./manifest.js";

describe("Earth Pulse math", () => {
  it("converts power to dB and doubling to ~3 dB", () => {
    expect(powerToDb(1)).toBe(0);
    expect(deltaDb(0.02, 0.04)).toBeCloseTo(3.0103, 4);
    expect(Number.isNaN(powerToDb(0))).toBe(true);
    expect(Number.isNaN(powerToDb(-1))).toBe(true);
  });
  it("never turns missing data into zero", () => {
    expect(Number.isNaN(waterCandidate(NaN, -17))).toBe(true);
    expect(changeClass(NaN, 1)).toBe(CHANGE.UNKNOWN);
    expect(Number.isNaN(waterPersistence([NaN, NaN]))).toBe(true);
  });
  it("classifies water change by set theory", () => {
    expect(changeClass(1, 1)).toBe(CHANGE.PERSISTENT);
    expect(changeClass(1, 0)).toBe(CHANGE.LOST);
    expect(changeClass(0, 1)).toBe(CHANGE.NEW);
    expect(changeClass(0, 0)).toBe(CHANGE.NEITHER);
  });
  it("computes area in km², not degrees²", () => {
    const a = cellAreaKm2(23, 0.002, 0.002);
    expect(a).toBeGreaterThan(0.04);
    expect(a).toBeLessThan(0.05);
  });
  it("converts 1 rad at λ = 0.24 m to about 19.1 mm", () => {
    expect(phaseToLosMeters(1, 0.24) * 1000).toBeCloseTo(19.099, 2);
    expect(Math.abs(wrapPhase(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
  });
  it("refuses a rate from a single pair", () => {
    const r = weightedVelocity([0, 12], [0, 1], [1, 1]);
    expect(Number.isNaN(r.slope)).toBe(true);
    const ok = weightedVelocity([0, 12, 24, 36], [0, 1, 2, 3], [1, 1, 1, 1]);
    expect(ok.slope).toBeCloseTo(1 / 12, 6);
  });
  it("bounds boundary uncertainty geometrically", () => {
    expect(boundaryAreaUncertainty(1000, 10)).toBeCloseTo(10000 + Math.PI * 100, 6);
  });
});

describe("Scientific integrity", () => {
  it("keeps the AOI locked", () => {
    expect([AOI.west, AOI.south, AOI.east, AOI.north]).toEqual([72.42, 22.88, 72.72, 23.19]);
  });
  it("has no acquisition inside the ASF data gap", () => {
    const inGap = GCOV_DATES.filter((d) => d.date >= "2026-07-27" && d.date <= "2026-08-10" && !d.gap);
    expect(inGap).toHaveLength(0);
  });
  it("never pairs provisional with validated scenes", () => {
    expect(GUNW_PAIRS.every((p) => p.maturity === "PROVISIONAL")).toBe(true);
    const validated = GCOV_DATES.filter((d) => d.maturity === "VALIDATED").map((d) => d.date);
    expect(GUNW_PAIRS.some((p) => validated.includes(p.reference) || validated.includes(p.secondary))).toBe(false);
  });
  it("treats layers without a real granule as unverified", () => {
    const m = { layers: { gcov_baseline: { status: "QC_ACCEPTED", granule_id: null, nasa_https_url: null } } };
    expect(deriveStatus(m)).toBe("NOT_VERIFIED");
    expect(moduleAvailability(m).floodghost).toBe(false);
  });
});
