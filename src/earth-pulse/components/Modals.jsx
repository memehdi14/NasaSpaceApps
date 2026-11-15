import { useState } from "react";
import { AOI, PORTALS, SOURCES } from "../config.js";
import { Modal, ProvBadge, Tex, downloadJson } from "./Common.jsx";

const SCIENCE_TABS = [
  { id: "basics", label: "Radar basics" },
  { id: "gcov", label: "GCOV math" },
  { id: "gunw", label: "GUNW math" },
  { id: "limits", label: "Limitations" },
  { id: "glossary", label: "Glossary" },
];

export function ScienceModal({ onClose }) {
  const [tab, setTab] = useState("basics");
  return (
    <Modal title="The science behind each map" onClose={onClose} wide>
      <div className="ep-modal-tabs" role="tablist">
        {SCIENCE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "basics" ? (
        <div role="tabpanel">
          <h3>What a synthetic aperture radar records</h3>
          <p>NISAR transmits L-band microwave pulses (about 24 cm wavelength) and records two things about each echo: how strong it is (backscatter) and its phase. Strength depends on surface roughness, moisture, structure and viewing geometry. Phase depends on the distance between the antenna and the ground.</p>
          <h3>Two products, two physical properties</h3>
          <p><strong>GCOV</strong> is the geocoded polarimetric covariance product. Its diagonal terms (HHHH, HVHV and so on) are terrain-corrected gamma-nought power. Earth Pulse uses them for water candidates, river margins and surface change.</p>
          <p><strong>GUNW</strong> is the geocoded unwrapped interferogram from two acquisitions. It carries unwrapped phase, coherence, connected components and correction layers. Earth Pulse uses it for line-of-sight ground displacement.</p>
          <h3>Polarisation</h3>
          <p>H and V describe the orientation of the transmitted and received wave. Co-polarised HH is sensitive to double-bounce structures such as trunks over water and building corners. Cross-polarised HV responds more to volume scattering in vegetation canopies. The explorer only offers bands present in the selected acquisition.</p>
        </div>
      ) : null}
      {tab === "gcov" ? (
        <div role="tabpanel">
          <h3>Linear power to decibels</h3>
          <p>For a valid diagonal power value <Tex>{"p>0"}</Tex>:</p>
          <Tex block>{"B_{dB}=10\\log_{10}(p),\\qquad \\Delta B_{dB}=10\\log_{10}\\!\\left(\\frac{p_2}{p_1}\\right)"}</Tex>
          <p>Subtracting two logarithms equals the logarithm of the ratio. The factor is 10 because these are powers, not amplitudes. Off-diagonal covariance terms are complex and must never be log-transformed.</p>
          <h3>Open-water candidate</h3>
          <Tex block>{"\\hat W_t(x)=\\mathbf 1\\{B_t(x)<\\tau_t\\}\\,M_{valid,t}(x)"}</Tex>
          <p>The threshold τ is chosen by inspecting the histogram, not copied from another site. Smooth roads and radar shadow can also fall below τ, which is why the result is a candidate.</p>
          <h3>Change is set theory</h3>
          <Tex block>{"W_{persistent}=(W_1\\cap W_2)\\cap V,\\quad W_{new}=(W_2\\setminus W_1)\\cap V,\\quad W_{lost}=(W_1\\setminus W_2)\\cap V"}</Tex>
          <Tex block>{"A_{new}=\\sum_{x\\in V}\\mathbf 1\\{x\\in W_{new}\\}\\,a_x"}</Tex>
          <p>Areas use metric pixel area <Tex>{"a_x"}</Tex>, never degrees squared.</p>
          <h3>Water persistence</h3>
          <Tex block>{"P_W(x)=\\frac{\\sum_t M_{valid,t}(x)\\,\\hat W_t(x)}{\\sum_t M_{valid,t}(x)}"}</Tex>
          <p>This is the fraction of observed dates classified as water, not a continuous inundation probability.</p>
          <h3>Boundary uncertainty</h3>
          <Tex block>{"\\delta A\\lesssim L\\,\\varepsilon+\\pi\\varepsilon^2"}</Tex>
        </div>
      ) : null}
      {tab === "gunw" ? (
        <div role="tabpanel">
          <h3>Phase to line-of-sight displacement</h3>
          <p>The pulse travels to the ground and back, so the round-trip phase is <Tex>{"4\\pi R/\\lambda"}</Tex>. A range change therefore gives:</p>
          <Tex block>{"\\Delta d_{LOS}=\\pm\\frac{\\lambda}{4\\pi}\\,\\Delta\\phi_{deformation}"}</Tex>
          <p>With λ = 0.24 m, a corrected phase change of 1 rad is about 19.1 mm. The sign depends on product convention and pair ordering, so it is read from metadata.</p>
          <h3>Phase is not pure deformation</h3>
          <Tex block>{"\\phi_{obs}=\\phi_{def}+\\phi_{topo}+\\phi_{orbit}+\\phi_{iono}+\\phi_{tropo}+\\phi_{noise}+\\phi_{ref}"}</Tex>
          <p>NISAR GUNW ships ionospheric and external correction layers that are not necessarily applied. The explorer’s ionosphere toggle demonstrates the difference; a correction is never applied twice.</p>
          <h3>Wrapping and connected components</h3>
          <Tex block>{"\\phi_{unwrapped}(x)=\\phi_{wrapped}(x)+2\\pi k(x),\\; k\\in\\mathbb Z"}</Tex>
          <p>Disconnected regions can carry different offsets, so each connected component gets its own reference pixel in Ground Zero.</p>
          <h3>Line of sight is not vertical</h3>
          <Tex block>{"d_{LOS}=l_E d_E+l_N d_N+l_U d_U"}</Tex>
          <p>One scalar cannot recover three components. Vertical motion is shown only under an explicit vertical-only assumption.</p>
          <h3>Coherence and noise</h3>
          <Tex block>{"\\operatorname{Var}(\\phi)\\approx\\frac{1-\\gamma^2}{2L\\gamma^2},\\qquad \\sigma_d\\approx\\frac{\\lambda}{4\\pi}\\sigma_\\phi"}</Tex>
          <h3>Rates need several pairs</h3>
          <Tex block>{"\\hat v=\\frac{\\sum_i w_i (t_i-\\bar t_w)(d_i-\\bar d_w)}{\\sum_i w_i(t_i-\\bar t_w)^2}"}</Tex>
          <p>Earth Pulse refuses to compute a rate from fewer than three dated observations. Weights are coherence squared.</p>
        </div>
      ) : null}
      {tab === "limits" ? (
        <div role="tabpanel">
          <h3>What these maps cannot tell you</h3>
          <ul className="ep-list">
            <li>A dark pixel is not proof of water. Shadow, smooth tarmac and calm reservoirs can look the same.</li>
            <li>A bright vegetated pixel is not proof of flooding under the canopy. It is a hypothesis.</li>
            <li>A moved water edge does not prove erosion. Water level, management and roughness produce the same observation.</li>
            <li>One GUNW pair gives displacement over that interval only. It is not a subsidence rate or trend.</li>
            <li>Line-of-sight motion is not vertical motion.</li>
            <li>Co-location of water change and ground motion does not show causation.</li>
            <li>Earth Pulse is not a flood warning, a legal boundary tool, or a structural safety assessment.</li>
          </ul>
          <h3>About the demo layers</h3>
          <p>Until NASA granules for the Ahmedabad AOI are authenticated, the maps run on a deterministic synthetic field so every interaction can be tested. Those layers are labelled illustrative everywhere they appear. Switch the header to NASA verified to see the honest state of the real data.</p>
        </div>
      ) : null}
      {tab === "glossary" ? (
        <dl role="tabpanel" className="ep-glossary">
          <dt>SAR</dt><dd>Synthetic aperture radar: an imaging radar that synthesises a long antenna from platform motion.</dd>
          <dt>Backscatter</dt><dd>The fraction of transmitted energy returned toward the radar.</dd>
          <dt>Gamma-nought (γ⁰)</dt><dd>Backscatter normalised by the illuminated area, terrain-corrected in GCOV.</dd>
          <dt>GCOV</dt><dd>NISAR Level 2 geocoded polarimetric covariance product.</dd>
          <dt>GUNW</dt><dd>NISAR Level 2 geocoded unwrapped interferogram product.</dd>
          <dt>InSAR</dt><dd>Interferometric SAR: comparing phase between two acquisitions.</dd>
          <dt>LOS</dt><dd>Line of sight: the direction between the satellite and the ground pixel.</dd>
          <dt>Coherence (γ)</dt><dd>0 to 1 measure of how similar the two radar echoes are; low values mean unreliable phase.</dd>
          <dt>Connected component</dt><dd>A region unwrapped together; different components may have different phase offsets.</dd>
          <dt>Double bounce</dt><dd>Energy reflected off two perpendicular surfaces, such as water and a trunk, back to the radar.</dd>
          <dt>Speckle</dt><dd>Grainy interference noise inherent to coherent imaging; reduced by multi-looking or filtering.</dd>
          <dt>AOI</dt><dd>Area of interest. Here, the locked Ahmedabad–Sabarmati rectangle.</dd>
        </dl>
      ) : null}
    </Modal>
  );
}

export function SourcesModal({ onClose, manifest }) {
  const groups = [...new Set(SOURCES.map((s) => s.group))];
  return (
    <Modal title="Sources and data provenance" onClose={onClose} wide>
      <p>
        Observations may only come from NASA Earthdata and ASF NISAR collections. Research papers are cited for context and are never
        loaded as measurements.
      </p>
      <p className="ep-warn">
        Inventory status: <strong>{manifest?.data?.inventory?.status || "UNSEARCHED"}</strong>. No Ahmedabad-specific NISAR granule has been
        authenticated in this build, so no granule links are shown. Run <code>pipelines/inventory_ahmedabad.py</code> to populate them.
      </p>
      {groups.map((g) => (
        <section key={g} className="ep-src-group">
          <h3>{g}</h3>
          <ul className="ep-src-list">
            {SOURCES.filter((s) => s.group === g).map((s) => (
              <li key={s.url}>
                <div>
                  <span>{s.title}</span>
                  <small>{s.note}</small>
                </div>
                <a href={s.url} target="_blank" rel="noreferrer noopener">Open source</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}

export function ProvenanceModal({ onClose, record, demo }) {
  return (
    <Modal title="Layer provenance" onClose={onClose}>
      <dl className="ep-kv">
        <dt>Layer</dt><dd>{record.layer_id}</dd>
        <dt>Status</dt><dd><ProvBadge kind={record.status} /></dd>
        <dt>Product</dt><dd>{record.product}</dd>
        <dt>Granule ID</dt><dd>{record.granule_id || "NOT_VERIFIED"}</dd>
        <dt>NASA URL</dt><dd>{record.nasa_https_url || "NOT_VERIFIED"}</dd>
        <dt>Acquired</dt><dd>{record.acquisition_times_utc.join(" → ") || "—"}</dd>
        <dt>Variable</dt><dd>{record.variable_path}</dd>
        <dt>Projection</dt><dd>EPSG:{record.projection_epsg}</dd>
        <dt>AOI</dt><dd>{AOI.west}, {AOI.south}, {AOI.east}, {AOI.north}</dd>
        <dt>Processing</dt><dd>{record.processing}</dd>
        <dt>Masks</dt><dd>{record.input_pixel_masks.join(", ")}</dd>
        <dt>Valid pixels</dt><dd>{record.valid_pixel_fraction != null ? `${(record.valid_pixel_fraction * 100).toFixed(1)}%` : "—"}</dd>
      </dl>
      {demo ? (
        <p className="ep-warn" style={{ marginTop: 14 }}>
          This layer is generated in the browser from a seeded synthetic model. It has no NASA granule and must not be cited as an observation.
        </p>
      ) : null}
      <div className="ep-actions">
        <button type="button" className="ep-btn ep-btn--primary ep-btn--small" onClick={() => downloadJson(`${record.layer_id}-provenance.json`, record)}>
          Download provenance JSON
        </button>
        <a className="ep-btn ep-btn--ghost ep-btn--small" href={PORTALS.asf} target="_blank" rel="noreferrer noopener">Open ASF Vertex</a>
      </div>
    </Modal>
  );
}
