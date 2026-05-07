/* Terra Tern Email CRM - Dashboard JS (connected to backend) */

const $ = (id) => document.getElementById(id);

/** Fix stuck full-screen modal backdrops / body locks / role pane drag state (restores clicks). */
function cleanupStuckInteractions() {
  try {
    document.body.style.cursor = "";
    document.body.style.removeProperty("user-select");
    document.body.style.userSelect = "";
    const openModal = document.querySelector(".modal.show");
    if (!openModal) {
      document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("padding-right");
    }
    $("roleAnalysisCard")?.classList.remove("tt-role-loading");
  } catch (e) {
    console.warn("cleanupStuckInteractions:", e);
  }
}

const COUNTRY_MAP = {
  "Canada": "🇨🇦", "Germany": "🇩🇪", "Australia": "🇦🇺", "Austria": "🇦🇹", "Luxembourg": "🇱🇺",
  "Netherlands": "🇳🇱", "Ireland": "🇮🇪", "Sweden": "🇸🇪", "UAE": "🇦🇪", "Switzerland": "🇨🇭", "India": "🇮🇳"
};
const COUNTRIES = Object.keys(COUNTRY_MAP);

/** Default Placement Officer roster (merged with values from the database in filters). */
const PLACEMENT_OFFICER_ROSTER = [
  "Arshitha M S",
  "A.karthika",
  "Pallerla Asritha",
  "Cherukupalli Saikrishna",
  "Vetrivel Muthukumar",
  "dummy-rm@terratern.com",
  "B. Bhargavi",
  "Ridhaan Jain",
];

let targets = [];
let currentSelectedCountry = null;
let currentSelectedIndustry = null;
let industriesList = [];

function toast(msg, type = "info") {
  console.log(`[${type}]`, msg);
  // Show a simple alert if it's an error or important
  if (type === "danger" || type === "error" || type === "success") {
    alert(msg);
  }
}

function parseIso(iso) {
  if (!iso) return null;
  let str = iso;
  if (typeof str === 'string' && !str.includes("Z") && !str.includes("+")) {
    str += "Z";
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateTime(iso) {
  const d = parseIso(iso);
  if (!d) return iso || "N/A";

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strTime = `${hours}:${minutes} ${ampm}`;

  return `${day}-${month}-${year} ${strTime}`;
}

/** On-track cumulative applications by service day (linear within each 30-day month). */
function getExpectedAppliedByDays(days) {
  const d = Math.max(0, parseInt(days, 10) || 0);
  if (d <= 0) return 0;
  if (d > 180) return 1200;
  const knots = [
    [0, 0], [30, 100], [60, 300], [90, 500], [120, 700], [150, 900], [180, 1100]
  ];
  for (let i = 0; i < knots.length - 1; i++) {
    const [d0, a0] = knots[i];
    const [d1, a1] = knots[i + 1];
    if (d <= d1) {
      if (d1 === d0) return a1;
      return Math.round(a0 + (a1 - a0) * (d - d0) / (d1 - d0));
    }
  }
  return 1100;
}

const SERVICE_TIERS = [
  { phase: 1, d0: 0, d1: 30, monthly: 100, cumAtEnd: 100, altCap: 10, label: "0–30 days (Month 1)" },
  { phase: 2, d0: 31, d1: 60, monthly: 200, cumAtEnd: 300, altCap: 20, label: "31–60 days (Month 2)" },
  { phase: 3, d0: 61, d1: 90, monthly: 200, cumAtEnd: 500, altCap: 40, label: "61–90 days (Month 3)" },
  { phase: 4, d0: 91, d1: 120, monthly: 200, cumAtEnd: 700, altCap: 50, label: "91–120 days (Month 4)" },
  { phase: 5, d0: 121, d1: 150, monthly: 200, cumAtEnd: 900, altCap: 100, label: "121–150 days (Month 5)" },
  { phase: 6, d0: 151, d1: 180, monthly: 200, cumAtEnd: 1100, altCap: 150, label: "151–180 days (Month 6)" }
];

function getServiceTierForDay(days) {
  const d = Math.max(0, parseInt(days, 10) || 0);
  if (d > 180) {
    return {
      phase: 7,
      d0: 181,
      d1: null,
      monthly: null,
      cumAtEnd: 1200,
      altCap: 100,
      label: "Beyond 180 days (extended period)",
      overflow: true
    };
  }
  for (const t of SERVICE_TIERS) {
    if (d >= t.d0 && d <= t.d1) return { ...t, overflow: false };
  }
  return { ...SERVICE_TIERS[0], overflow: false };
}

function daysBucketShort(days) {
  const d = Math.max(0, parseInt(days, 10) || 0);
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  if (d <= 120) return "91-120";
  if (d <= 150) return "121-150";
  if (d <= 180) return "151-180";
  return "180+";
}

const SMART_AUTOMATION_BACKLOG_CAP = 100;

/** Mirrors server WORKFLOW_PHASES — used when API omits workflow_phases (avoids broken HTML data-* JSON). */
const SA_WF_PHASES = {
  1: { days: [0, 30], cumulative: 100, per_batch: 10, target: 100, label: "Phase 1 (0-30 Days)" },
  2: { days: [31, 60], cumulative: 300, per_batch: 20, target: 200, label: "Phase 2 (31-60 Days)" },
  3: { days: [61, 90], cumulative: 500, per_batch: 40, target: 200, label: "Phase 3 (61-90 Days)" },
  4: { days: [91, 120], cumulative: 700, per_batch: 50, target: 200, label: "Phase 4 (91-120 Days)" },
  5: { days: [121, 150], cumulative: 900, per_batch: 100, target: 200, label: "Phase 5 (121-150 Days)" },
  6: { days: [151, 180], cumulative: 1100, per_batch: 150, target: 200, label: "Phase 6 (151-180 Days)" },
  7: { days: [181, 9999], cumulative: 1200, per_batch: 100, target: 100, label: "Overflow (>180 Days)" },
};

function saPhaseNumForDay(d) {
  const n = Math.max(0, parseInt(d, 10) || 0);
  for (let p = 1; p <= 7; p++) {
    const [d0, d1] = SA_WF_PHASES[p].days;
    if (n >= d0 && n <= d1) return p;
  }
  return 7;
}

function saFormatPeriodFromServiceStart(serviceIso, d0, d1) {
  const t = parseIso(serviceIso);
  if (!t) return { period_start: "", period_end: "" };
  const startMs = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const dayMs = 86400000;
  const ps = new Date(startMs + d0 * dayMs);
  const pStart = `${String(ps.getUTCDate()).padStart(2, "0")}-${String(ps.getUTCMonth() + 1).padStart(2, "0")}-${ps.getUTCFullYear()}`;
  if (d1 >= 9000) return { period_start: pStart, period_end: "—" };
  const pe = new Date(startMs + d1 * dayMs);
  const pEnd = `${String(pe.getUTCDate()).padStart(2, "0")}-${String(pe.getUTCMonth() + 1).padStart(2, "0")}-${pe.getUTCFullYear()}`;
  return { period_start: pStart, period_end: pEnd };
}

function saUtcFmtAtDay(serviceIso, dayNum) {
  const t = parseIso(serviceIso);
  if (!t) return "—";
  const startMs = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const dayMs = 86400000;
  const ps = new Date(startMs + dayNum * dayMs);
  return `${String(ps.getUTCDate()).padStart(2, "0")}-${String(ps.getUTCMonth() + 1).padStart(2, "0")}-${ps.getUTCFullYear()}`;
}

/**
 * Forward-looking rows from the chosen day: on-track target now, then upcoming phase boundaries.
 * Calendar dates use service start when set; curve math uses days_in_system only.
 */
function saBuildForwardPlanRows(daysInSystem, serviceIso, totalApplied, totalTarget = 1200) {
  const d = Math.max(0, parseInt(daysInSystem, 10) || 0);
  const cap = Math.max(1, parseInt(totalTarget, 10) || 1200);
  const applied = Math.max(0, parseInt(totalApplied, 10) || 0);
  const expectedNow = getExpectedAppliedByDays(d);
  const gap = expectedNow - applied;
  const plan = computeSmartAutomationPlanLocal(d, applied, 100, cap, 1);
  let gapLabel;
  if (gap > 0) gapLabel = `${gap} behind the curve (catch-up)`;
  else if (gap < 0) gapLabel = `${Math.abs(gap)} ahead of the curve`;
  else gapLabel = "on the curve";

  const rows = [];
  rows.push({
    dateStr: saUtcFmtAtDay(serviceIso, d),
    day: d,
    cum: expectedNow,
    label: `Today — applied ${applied} · ${gapLabel} · next batch (est.): ${plan.suggested_batch_per_run}`,
    highlight: true,
  });

  const boundaries = [
    { day: 30, cum: 100, label: "Phase 1 ends" },
    { day: 60, cum: 300, label: "Phase 2 ends" },
    { day: 90, cum: 500, label: "Phase 3 ends" },
    { day: 120, cum: 700, label: "Phase 4 ends" },
    { day: 150, cum: 900, label: "Phase 5 ends" },
    { day: 180, cum: 1100, label: "Phase 6 ends (curve 1100)" },
    { day: 181, cum: cap, label: `Overflow / full cap (${cap})` },
  ];

  for (const b of boundaries) {
    if (b.day > d) {
      rows.push({
        dateStr: saUtcFmtAtDay(serviceIso, b.day),
        day: b.day,
        cum: b.cum,
        label: `Upcoming — ${b.label}`,
        highlight: false,
      });
    }
  }

  if (d > 180 && applied < cap) {
    rows.push({
      dateStr: "—",
      day: "—",
      cum: cap,
      label: `Extended — ${cap - applied} applications left to reach cap (overflow pacing)`,
      highlight: false,
    });
  }

  return rows;
}

function saBuildWorkflowPhasesClient(days, serviceIso) {
  const currentP = saPhaseNumForDay(days);
  const phases = [];
  for (let pnum = 1; pnum <= 7; pnum++) {
    const info = SA_WF_PHASES[pnum];
    const [d0, d1] = info.days;
    let st = "upcoming";
    if (pnum < currentP) st = "completed";
    else if (pnum === currentP) st = "current";
    else st = "upcoming";
    const dr = d1 < 9000 ? `${d0}–${d1}` : `${d0}+`;
    const pd = serviceIso ? saFormatPeriodFromServiceStart(serviceIso, d0, d1) : { period_start: "", period_end: "" };
    phases.push({
      phase: pnum,
      label: info.label,
      days_range: dr,
      cumulative_target: info.cumulative,
      per_batch: info.per_batch,
      phase_app_target: info.target,
      period_start: pd.period_start,
      period_end: pd.period_end,
      status: st,
    });
  }
  return phases;
}

function normalizeSaPredictionPayload(p) {
  const days = Math.max(0, parseInt(p.days_in_system, 10) || 0);
  const applied = Math.max(0, parseInt(p.total_applied, 10) || 0);
  const tgt = Math.max(1, parseInt(p.total_target, 10) || 1200);
  const svcIso = (p.service_start_utc || "").trim();
  let phases = Array.isArray(p.workflow_phases) ? p.workflow_phases.filter(Boolean) : [];
  if (!phases.length) {
    phases = saBuildWorkflowPhasesClient(days, svcIso);
  } else if (svcIso && phases[0] && !phases[0].period_start) {
    phases = saBuildWorkflowPhasesClient(days, svcIso);
  }
  let pct = p.prediction_pct;
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    pct = Math.min(100, Math.round((applied / tgt) * 1000) / 10);
  }
  return {
    candidate_name: p.candidate_name || "Candidate",
    days_in_system: days,
    total_applied: applied,
    total_target: tgt,
    prediction_pct: pct,
    workflow_plan_status: (p.workflow_plan_status || "").trim(),
    service_start_utc: svcIso,
    expected_applications_by_now:
      typeof p.expected_applications_by_now === "number" ? p.expected_applications_by_now : undefined,
    workflow_phases: phases,
  };
}

/** Mirrors server: backlog → min(pending, 100, remaining); on track → 0 (not limited by maxPerRun). */
function computeSmartAutomationPlanLocal(days, applied, maxPerRun = 100, serviceCap = 1200, intervalDays = 1) {
  const d = Math.max(0, parseInt(days, 10) || 0);
  const a = Math.max(0, parseInt(applied, 10) || 0);
  const cap = Math.max(1, Math.min(500, parseInt(maxPerRun, 10) || 100));
  const interval = Math.max(1, Math.min(7, parseInt(intervalDays, 10) || 1));
  const remaining = Math.max(0, serviceCap - a);
  const tier = getServiceTierForDay(d);
  const phaseCap = tier.overflow ? 100 : tier.altCap;
  const expected = getExpectedAppliedByDays(d);
  const onTrackDelta = a - expected;
  const pendingOnTrack = Math.max(0, expected - a);
  let batch;
  let backlogMode = false;
  if (pendingOnTrack > 0) {
    batch = Math.min(pendingOnTrack, SMART_AUTOMATION_BACKLOG_CAP, remaining);
    backlogMode = true;
  } else {
    batch = 0;
  }
  let daysLeft;
  if (d <= 180) {
    daysLeft = Math.max(1, 180 - d);
  } else {
    daysLeft = Math.max(1, Math.ceil(remaining / Math.max(1, SMART_AUTOMATION_BACKLOG_CAP)));
  }
  const scheduleSlots = Math.max(1, Math.ceil(daysLeft / interval));
  return {
    phase: tier.phase,
    phase_label: tier.label,
    phase_batch_cap: phaseCap,
    expected_applications_by_now: expected,
    on_track_delta: onTrackDelta,
    pending_on_track: pendingOnTrack,
    remaining_to_cap: remaining,
    suggested_batch_per_run: Math.round(batch),
    backlog_mode: backlogMode,
    backlog_safe_cap: SMART_AUTOMATION_BACKLOG_CAP,
    alternate_interval_days: interval,
    estimated_alternate_slots_remaining: scheduleSlots,
    days_left_in_180_window: d <= 180 ? Math.max(0, 180 - d) : 0,
    days_bucket: daysBucketShort(d)
  };
}

function appOriginHint() {
  try {
    return typeof location !== "undefined" && location.origin
      ? ` Open ${location.origin} and restart the Flask server if you just updated the app.`
      : " Restart the Flask server if you just updated the app.";
  } catch {
    return " Restart the Flask server if you just updated the app.";
  }
}

function htmlResponseToApiError(res, text) {
  const t = (text || "").toString();
  if (/<!doctype/i.test(t) || /<html/i.test(t)) {
    const m = t.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = m ? m[1].trim() : "";
    return `HTTP ${res.status} ${res.statusText || ""}${title ? `: ${title}` : ""}.${appOriginHint()}`;
  }
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}

function appOriginHintRunning() {
  try {
    return typeof location !== "undefined" && location.origin
      ? ` Open ${location.origin} and ensure the Flask server is running.`
      : " Ensure the Flask server is running.";
  } catch {
    return " Ensure the Flask server is running.";
  }
}

function shortApiError(msg) {
  const s = (msg || "").toString();
  if (/<!doctype/i.test(s) || /<html/i.test(s)) {
    const m = s.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = m ? m[1].trim() : "";
    return `Server returned an error page${title ? `: ${title}` : ""}.${appOriginHintRunning()}`;
  }
  return s.length > 280 ? `${s.slice(0, 280)}…` : s;
}

/** Extra hint when Smart Automation endpoints are missing (old server.py on the host). */
function smartApiDeployHint(fullMessage) {
  const raw = (fullMessage || "").toString();
  const s = raw.toLowerCase();
  if (!/\b404\b/.test(s) && s.trim() !== "not found") return "";
  return " Smart Automation routes are missing on this server — copy the latest server.py to the host, restart Flask, then open /__health__ and confirm build smart-automation-v2.";
}

function updateServiceCalculator() {
  const daysEl = $("svcCalcDays");
  const appEl = $("svcCalcApplied");
  const out = $("svcCalcOut");
  if (!daysEl || !appEl || !out) return;

  const days = Math.max(0, parseInt(daysEl.value, 10) || 0);
  const applied = Math.max(0, parseInt(appEl.value, 10) || 0);
  const expected = getExpectedAppliedByDays(days);
  const tier = getServiceTierForDay(days);
  const toHitTrack = expected - applied;
  const toHitCap = Math.max(0, 1200 - applied);

  let trackMsg;
  if (toHitTrack === 0) trackMsg = "<span class='text-success'>Right on the phased track.</span>";
  else if (toHitTrack > 0) trackMsg = `<span class='text-danger'>Need <strong>${toHitTrack}</strong> more applications to match today’s on-track target (${expected}).</span>`;
  else trackMsg = `<span class='text-success'>Ahead of track by <strong>${Math.abs(toHitTrack)}</strong> (on-track target ${expected}).</span>`;

  const altNote = tier.overflow
    ? "Extended: alternate-day pacing is off; workflow uses up to <strong>100</strong> applications per run until the <strong>1200</strong> cap."
    : `This phase allows up to <strong>${tier.altCap}</strong> job applications per alternate-day batch (monthly quota <strong>${tier.monthly}</strong> in this window).`;

  out.innerHTML = `
    <div class="tt-svc-calc-result row g-3">
      <div class="col-md-6">
        <div class="tt-svc-result-card p-4 h-100">
          <div class="text-muted text-uppercase fw-bold small mb-2" style="letter-spacing:0.06em;">Current phase</div>
          <div class="fs-5 fw-semibold text-body mb-2">P${tier.phase} — ${tier.label}</div>
          <div class="text-muted small lh-base">${altNote}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="tt-svc-result-card p-4 h-100">
          <div class="text-muted text-uppercase fw-bold small mb-2" style="letter-spacing:0.06em;">Plan vs your numbers</div>
          <ul class="mb-0 ps-3 small lh-lg list-unstyled ps-0">
            <li class="mb-2"><strong>On-track target today:</strong> ${expected} applications <span class="text-muted">(day ${days})</span></li>
            <li class="mb-2"><strong>Applications entered:</strong> ${applied}</li>
            <li class="mb-2">${trackMsg}</li>
            <li class="mb-2"><strong>Remaining to 1200 cap:</strong> ${toHitCap}</li>
            <li class="text-muted small mt-3 pt-2 border-top">Milestones: 100 → 300 → 500 → 700 → 900 → 1100 by day 180; extended period to 1200.</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

const BUCKLIST_UL_IDS = {
  "0-30": "bucklistUl-0-30",
  "31-60": "bucklistUl-31-60",
  "61-90": "bucklistUl-61-90",
  "91-120": "bucklistUl-91-120",
  "121-150": "bucklistUl-121-150",
  "151-180": "bucklistUl-151-180",
  ">180": "bucklistUl-gt180",
};

const BUCKLIST_CAT_BOUNDS = {
  "0-30": [0, 30],
  "31-60": [31, 60],
  "61-90": [61, 90],
  "91-120": [91, 120],
  "121-150": [121, 150],
  "151-180": [151, 180],
  ">180": [181, 999999],
};

/** Last Bucklist JSON (for wave view). */
let lastBucklistData = null;
/** API key (e.g. "0-30") when band detail panel is open — used to refresh after workflow changes. */
let bucklistOpenBandKey = null;

const BUCKLIST_WAVE_TITLE = {
  "0-30": "0 – 30 (service days)",
  "31-60": "31 – 60",
  "61-90": "61 – 90",
  "91-120": "91 – 120",
  "121-150": "121 – 150",
  "151-180": "151 – 180",
  ">180": "Over 180",
};

const BUCKLIST_BAND_LABELS = {
  "0-30": "Band 0 – 30",
  "31-60": "Band 31 – 60",
  "61-90": "Band 61 – 90",
  "91-120": "Band 91 – 120",
  "121-150": "Band 121 – 150",
  "151-180": "Band 151 – 180",
  ">180": "Band over 180",
};

/** API bucket key for band automation modal / data-buck-auto attr. */
function bucklistAutoAttrToApiKey(attr) {
  return attr === "gt180" ? ">180" : attr;
}

function bucklistHideWaveAndPeek() {
  bucklistOpenBandKey = null;
  $("bucklistWavePanel")?.classList.add("d-none");
  $("bucklistPeekPanel")?.classList.add("d-none");
  document.querySelectorAll(".tt-bucklist-cell").forEach((c) => c.classList.remove("tt-bucklist-cell--active"));
  document.querySelectorAll("#bucklistGrid .tt-bucklist-cell-head").forEach((h) => h.setAttribute("aria-expanded", "false"));
}

function bucklistSetActiveColumn(apiKey) {
  document.querySelectorAll("#bucklistGrid .tt-bucklist-cell").forEach((c) => {
    const attr = c.dataset.buckRange;
    const key = attr === "gt180" ? ">180" : attr;
    c.classList.toggle("tt-bucklist-cell--active", key === apiKey);
  });
  document.querySelectorAll("#bucklistGrid .tt-bucklist-cell-head").forEach((h) => {
    const cell = h.closest(".tt-bucklist-cell");
    const attr = cell?.dataset.buckRange;
    const key = attr === "gt180" ? ">180" : attr;
    h.setAttribute("aria-expanded", key === apiKey ? "true" : "false");
  });
}

function openBucklistWaveForKey(apiKey) {
  const run = () => void paintBucklistBandDetail(apiKey);
  if (!lastBucklistData) {
    void refreshBucklist().then(run);
    return;
  }
  run();
}

function bucklistRepaintOpenBandIfAny() {
  const panel = $("bucklistWavePanel");
  if (!bucklistOpenBandKey || !panel || panel.classList.contains("d-none")) return;
  void paintBucklistBandDetail(bucklistOpenBandKey);
}

/** Applications completed on the candidate profile (Band setup / Candidates tab) — not the same as plan total_applied. */
function bucklistProfileAppsDone(c) {
  return Math.max(0, parseInt(String(c.smart_baseline_applied ?? 0), 10) || 0);
}

/** Band detail: table with workflow-style progress, pause / stop / report (same actions as main dashboard). */
async function paintBucklistBandDetail(apiKey) {
  bucklistOpenBandKey = apiKey;
  const data = lastBucklistData;
  const rows = (data?.buckets || {})[apiKey] || [];
  const panel = $("bucklistWavePanel");
  const title = $("bucklistWaveTitle");
  const hint = $("bucklistWaveHint");
  const tbody = $("bucklistWaveTbody");
  if (!panel || !title || !tbody) return;

  const q = bucklistBucketSearchNormalize($("bucklistBucketSearch")?.value || "");
  const filtered = !q ? rows : rows.filter((c) => bucklistCandidateSearchHay(c).includes(q));

  title.textContent = `${BUCKLIST_WAVE_TITLE[apiKey] || apiKey} · ${filtered.length} candidate${filtered.length === 1 ? "" : "s"}`;
  if (hint) {
    hint.classList.remove("d-none");
    if (filtered.length === 0) {
      hint.textContent = q
        ? "No candidates match your search in this band."
        : "No candidates in this band yet — use Band setup or Not assigned.";
    } else {
      hint.textContent =
        "Column Band setup: Save updates everyone here. HR country/industry and scheduling: 6-Month Service. Click a name to peek.";
    }
  }

  let plans = [];
  try {
    plans = await apiJson("/api/workflow-plans");
  } catch (e) {
    console.warn("workflow-plans for bucklist band view", e);
  }
  const planByCand = new Map();
  for (const p of plans) {
    const k = p.candidate_id;
    if (k != null && !planByCand.has(k)) planByCand.set(k, p);
  }

  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-4 text-muted">No rows to show. Adjust search or pick another band.</td></tr>';
    panel.classList.remove("d-none");
    bucklistSetActiveColumn(apiKey);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  filtered.forEach((c) => {
    const p = planByCand.get(c.id);
    const tr = document.createElement("tr");
    const dayNum = c.days != null && c.days !== "" ? escapeHtml(String(c.days)) : null;
    const dayCell = dayNum ? `Day ${dayNum}` : "—";
    const src = bucklistDaysSourceBadge(c);
    const appsShow = bucklistProfileAppsDone(c);
    if (!p) {
      tr.innerHTML = `
        <td>
          <button type="button" class="btn btn-link p-0 text-start text-decoration-none fw-bold" onclick="bucklistShowCandidatePeek(${c.id})">${escapeHtml(c.name)}</button>
          <div class="small text-muted text-truncate" style="max-width:16rem" title="${escapeHtml(c.email)}">${escapeHtml(c.email)}</div>
          <div class="d-flex flex-wrap align-items-center gap-1 mt-1">${src}${bucklistCardMetaHtml(c)}</div>
        </td>
        <td class="text-muted small">—</td>
        <td><div class="small text-muted">${dayCell}</div></td>
        <td class="text-end"><span class="fw-semibold" title="Profile “Apps done” (candidate record)">${appsShow}</span></td>
        <td><span class="badge bg-secondary bg-opacity-15 text-secondary border border-secondary border-opacity-25">No plan</span></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="bucklistShowCandidatePeek(${c.id})" title="Quick profile"><i class="bi bi-person-lines-fill"></i></button>
            <button type="button" class="btn btn-sm btn-outline-primary" onclick='openAnalyticsForCandidate(${JSON.stringify(c.name)})' title="Runs &amp; Reports (Analytics)"><i class="bi bi-bar-chart-line"></i></button>
          </div>
        </td>`;
      tbody.appendChild(tr);
      return;
    }

    const progressPct = p.total_target > 0 ? (p.total_applied / p.total_target) * 100 : 0;
    let statusBadge = `<span class="badge badge-wf-active">Active</span>`;
    if (p.is_paused || p.status === "paused") statusBadge = `<span class="badge badge-wf-paused">Paused</span>`;
    if (p.status === "completed") statusBadge = `<span class="badge badge-wf-completed">Completed</span>`;
    if (p.status === "expired") statusBadge = `<span class="badge badge-wf-expired">Expired</span>`;

    tr.innerHTML = `
      <td>
        <button type="button" class="btn btn-link p-0 text-start text-decoration-none fw-bold" onclick="bucklistShowCandidatePeek(${c.id})">${escapeHtml(c.name)}</button>
        <div class="small text-muted text-truncate" style="max-width:16rem" title="${escapeHtml(c.email)}">${escapeHtml(c.email)}</div>
        <div class="d-flex flex-wrap align-items-center gap-1 mt-1">${src}<span class="badge bg-light text-dark border">Phase ${p.current_phase}</span>${bucklistCardMetaHtml(c)}</div>
      </td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="progress progress-workflow flex-grow-1" style="width: 72px; min-width: 64px;">
            <div class="progress-bar" style="width: ${progressPct}%"></div>
          </div>
          <span class="small fw-semibold text-nowrap">${p.total_applied}/${p.total_target}</span>
        </div>
      </td>
      <td><div class="small text-muted">Day ${p.elapsed_days}</div></td>
      <td class="text-end"><span class="fw-semibold" title="Profile baseline: applications done (Candidates / Band setup). Progress column uses the 6-month plan counters.">${appsShow}</span></td>
      <td>${statusBadge}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-primary" onclick="sendNowWorkflow(${p.id})" title="Send now"><i class="bi bi-send-fill"></i></button>
          ${
            p.status === "paused"
              ? `<button type="button" class="btn btn-outline-success" onclick="resumeWorkflow(${p.id})" title="Resume"><i class="bi bi-play-fill"></i></button>`
              : `<button type="button" class="btn btn-outline-warning" onclick="pauseWorkflow(${p.id})" title="Pause"><i class="bi bi-pause-fill"></i></button>`
          }
          <button type="button" class="btn btn-outline-danger" onclick="deleteWorkflow(${p.id})" title="Stop"><i class="bi bi-stop-circle"></i></button>
          <button type="button" class="btn btn-outline-info" onclick="reportWorkflow(${p.candidate_id}, ${p.id})" title="Export candidate pack"><i class="bi bi-download"></i></button>
          <button type="button" class="btn btn-outline-primary" onclick='openAnalyticsForCandidate(${JSON.stringify(c.name)})' title="Runs &amp; Reports"><i class="bi bi-bar-chart-line"></i></button>
          <button type="button" class="btn btn-outline-secondary" onclick="openWorkflowDetail(${p.id})" title="Details"><i class="bi bi-three-dots"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  panel.classList.remove("d-none");
  bucklistSetActiveColumn(apiKey);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function bucklistShowCandidatePeek(id) {
  const panel = $("bucklistPeekPanel");
  const body = $("bucklistPeekBody");
  if (!panel || !body) return;
  body.innerHTML = '<div class="text-center text-muted py-3">Loading…</div>';
  panel.classList.remove("d-none");
  try {
    const c = await apiJson(`/api/candidates/${id}`);
    const bd = c.bucklist_days_in_system;
    const dcomp = c.days_in_system_computed;
    const daysLine =
      bd != null && bd !== ""
        ? `Saved tenure (day #): <strong>${escapeHtml(String(bd))}</strong>`
        : dcomp != null && dcomp !== ""
          ? `Estimated day # <strong>${escapeHtml(String(dcomp))}</strong> — pin a number on <strong>Candidates</strong> to fix the column`
          : "Not pinned — use <strong>Candidates</strong> or <strong>Not assigned</strong> below.";
    body.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
        <div><strong>${escapeHtml(c.name || "")}</strong><div class="text-muted">${escapeHtml(c.email || "")}</div></div>
        <div class="small text-md-end">${daysLine}</div>
      </div>
      <dl class="row small mb-0 g-2">
        <dt class="col-sm-3 text-muted">Apps done <span class="text-danger">*</span></dt><dd class="col-sm-9"><strong>${escapeHtml(String(c.smart_baseline_applied ?? 0))}</strong> <span class="text-muted">applications completed till now (baseline)</span></dd>
        <dt class="col-sm-3 text-muted">Country</dt><dd class="col-sm-9">${escapeHtml((c.smart_country || "").trim() || "—")}</dd>
        <dt class="col-sm-3 text-muted">Industry</dt><dd class="col-sm-9">${escapeHtml(((c.smart_industry || "").trim() || (c.industry_types || "").trim()) || "—")}</dd>
        <dt class="col-sm-3 text-muted">PA / RM / PO</dt><dd class="col-sm-9">${escapeHtml([c.pa_member, c.rm_member, c.placement_officer_member].filter(Boolean).join(" · ") || "—")}</dd>
        <dt class="col-sm-3 text-muted">Enrollment</dt><dd class="col-sm-9">${escapeHtml([c.enrollment_id, c.enrollment_status].filter(Boolean).join(" · ") || "—")}</dd>
        <dt class="col-sm-3 text-muted">Roles</dt><dd class="col-sm-9">${escapeHtml((c.roles_text || "").trim() || "—")}</dd>
        <dt class="col-sm-3 text-muted">Assets</dt><dd class="col-sm-9">${c.resume_on_file ? "Resume ✓" : "No resume"} · ${c.cover_on_file ? "Cover ✓" : "No cover"}</dd>
      </dl>
      <div class="d-flex flex-wrap gap-2 mt-3 pt-2 border-top">
        <button type="button" class="btn btn-sm btn-outline-info" onclick="reportWorkflow(${c.id}, null)" title="CSV / pack download">Export</button>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick='openAnalyticsForCandidate(${JSON.stringify(c.name)})' title="Runs &amp; Reports">Analytics</button>
      </div>`;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    body.innerHTML = `<div class="text-danger small">${escapeHtml(e.message || "Load failed")}</div>`;
  }
}

/** Click column headers: wave list. Must run once after DOM exists. */
function wireBucklistColumnHeaders() {
  const grid = $("bucklistGrid");
  if (!grid || grid.dataset.buckHeadWire) return;
  grid.dataset.buckHeadWire = "1";
  grid.querySelectorAll(".tt-bucklist-cell-head").forEach((head) => {
    head.setAttribute("tabindex", "0");
    head.setAttribute("role", "button");
    head.setAttribute("aria-expanded", "false");
    const cell = head.closest(".tt-bucklist-cell");
    const t = cell?.querySelector(".tt-bucklist-head-title");
    if (t) head.setAttribute("aria-label", `Open band — list, progress, pause, stop: ${t.textContent}`);
  });
  grid.addEventListener("click", (e) => {
    if (e.target.closest(".tt-bucklist-setup-btn")) return;
    const head = e.target.closest(".tt-bucklist-cell-head");
    if (head) {
      const cell = head.closest(".tt-bucklist-cell");
      if (!cell) return;
      const attr = cell.dataset.buckRange;
      openBucklistWaveForKey(attr === "gt180" ? ">180" : attr);
      return;
    }
    const list = e.target.closest(".tt-bucklist-ul");
    if (!list) return;
    const cell = list.closest(".tt-bucklist-cell");
    if (!cell) return;
    const attr = cell.dataset.buckRange;
    openBucklistWaveForKey(attr === "gt180" ? ">180" : attr);
  });
  grid.addEventListener("keydown", (e) => {
    const head = e.target.closest(".tt-bucklist-cell-head");
    if (!head || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    const cell = head.closest(".tt-bucklist-cell");
    if (!cell) return;
    const attr = cell.dataset.buckRange;
    openBucklistWaveForKey(attr === "gt180" ? ">180" : attr);
  });
}

async function loadWfIndustryCountryDatalists() {
  try {
    const indList = await apiJson("/api/targets/industries");
    const indDataList = $("wfIndustryList");
    const ctyDataList = $("wfCountryList");
    if (indDataList && ctyDataList) {
      indDataList.innerHTML = "";
      ctyDataList.innerHTML = "";
      const allCountries = new Set();
      const industries = Array.isArray(indList) ? [...indList] : [];
      industries.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
      for (const item of industries) {
        const opt = document.createElement("option");
        opt.value = item.name;
        indDataList.appendChild(opt);
        const countries = Array.isArray(item.countries) ? item.countries : [];
        for (const c of countries) {
          const v = (c != null && String(c).trim()) ? String(c).trim() : "";
          if (v) allCountries.add(v);
        }
      }
      const countrySorted = [...allCountries].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      for (const c of countrySorted) {
        const opt = document.createElement("option");
        opt.value = c;
        ctyDataList.appendChild(opt);
      }
    }
  } catch (e) {
    console.error("Could not load industries", e);
  }
}

function bucklistSetupCurrentBandKey() {
  const sel = $("bucklistSetupBandSelect");
  return sel && sel.value ? sel.value : "0-30";
}

/** Service day for backlog hint: same field as “Day in band” / 6-Month calculator “Service day count”, with band bounds check. */
function bucklistSetupServiceDayForHint(cat) {
  const b = BUCKLIST_CAT_BOUNDS[cat];
  const dayEl = $("bucklistNewCandDay");
  if (dayEl && dayEl.value.trim() !== "" && b) {
    const v = parseInt(dayEl.value, 10);
    if (!Number.isNaN(v) && v >= b[0] && (b[1] > 100000 || v <= b[1])) {
      return v;
    }
  }
  const fallback = parseInt(bucklistDefaultDaysForCategory(cat), 10);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function updateBucklistSetupBacklogHint() {
  const hint = $("bucklistSetupBacklogHint");
  if (!hint) return;
  const cat = bucklistSetupCurrentBandKey();
  const d = bucklistSetupServiceDayForHint(cat);
  const expected = getExpectedAppliedByDays(d);
  const applied = Math.max(0, parseInt($("bucklistSetupSharedApplied")?.value || "0", 10) || 0);
  const diff = applied - expected;
  const remain = Math.max(0, 1200 - applied);

  hint.className = "small mt-2 mb-0";
  if (diff < 0) hint.classList.add("text-danger");
  else if (diff > 0) hint.classList.add("text-success");
  else hint.classList.add("text-body-secondary");

  let statusLine;
  if (diff === 0) {
    statusLine = "You match today’s on-track target.";
  } else if (diff > 0) {
    statusLine = `Ahead of target by ${diff}.`;
  } else {
    statusLine = `Need ${Math.abs(diff)} more applications to match today’s on-track target (${expected} by day ${d}).`;
  }

  hint.textContent =
    `Uses the same curve as the 6-Month Service calculator. Day ${d}: on-track target ≈ ${expected}. Applications entered: ${applied}. ${statusLine} Remaining to 1200 cap: ${remain}. Batches scale when behind (within caps).`;
}

/** When non-null, band select is locked (opened from a column). */
let bucklistSetupLockedBandKey = null;

function setBucklistSetupBandLocked(lockApiKey) {
  const sel = $("bucklistSetupBandSelect");
  const hint = $("bucklistSetupBandLockedHint");
  bucklistSetupLockedBandKey = lockApiKey || null;
  if (!sel) return;
  if (bucklistSetupLockedBandKey) {
    sel.value = bucklistSetupLockedBandKey;
    sel.disabled = true;
    if (hint) hint.classList.remove("d-none");
  } else {
    sel.disabled = false;
    if (hint) hint.classList.add("d-none");
  }
}

function syncBucklistSetupSubtitleForBand(apiKey) {
  const subEl = $("bucklistSetupSubtitle");
  if (!subEl) return;
  const rows = (lastBucklistData?.buckets || {})[apiKey] || [];
  subEl.textContent = rows.length
    ? `${rows.length} in this band — column Band setup saves all rows here. Use 6-Month Service to schedule email automation.`
    : "No one in this band yet — add a new candidate below or choose another tenure band.";
}

function syncBucklistSetupHrFocusUi() {
  const el = $("bucklistSetupHrFocusNote");
  const appsHint = $("bucklistSetupSharedAppliedHint");
  if (el) el.classList.remove("d-none");
  if (appsHint) {
    appsHint.innerHTML =
      "For <strong>Add new candidate</strong>, this count is saved as their applications baseline. People already in the band keep their own Apps done from <strong>Candidates</strong>; this field also drives the backlog hint below.";
  }
  if (!el) return;
  el.className = "alert alert-light border py-2 px-3 small mb-0 text-body-secondary";
  el.innerHTML =
    "<strong>Save</strong> syncs tenure day + profile baseline for each person in this band from their record. HR targets and email scheduling: <strong>6-Month Service</strong> tab.";
}

function syncBucklistNewCandDayField() {
  const sel = $("bucklistSetupBandSelect");
  const dayEl = $("bucklistNewCandDay");
  const hint = $("bucklistNewCandDayHint");
  if (!sel || !dayEl) return;
  const cat = sel.value;
  const b = BUCKLIST_CAT_BOUNDS[cat];
  if (!b) return;
  dayEl.min = String(b[0]);
  if (b[1] > 100000) {
    dayEl.removeAttribute("max");
  } else {
    dayEl.max = String(b[1]);
  }
  if (hint) {
    hint.textContent =
      cat === ">180"
        ? `Use day ${b[0]} or higher (e.g. 200).`
        : `Must be between ${b[0]} and ${b[1]} for this band.`;
  }
  const cur = parseInt(dayEl.value, 10);
  if (dayEl.value === "" || Number.isNaN(cur) || cur < b[0] || (b[1] < 999999 && cur > b[1])) {
    dayEl.value = bucklistDefaultDaysForCategory(cat);
  }
  updateBucklistSetupBacklogHint();
}

function clearBucklistSetupNewCandidateFields() {
  [
    "bucklistNewCandName",
    "bucklistNewCandEmail",
    "bucklistNewCandAppPwd",
    "bucklistNewCandPaMember",
    "bucklistNewCandRmMember",
    "bucklistNewCandPlacementOfficer",
    "bucklistNewCandRoles",
    "bucklistNewCandIndustryTypes",
    "bucklistNewCandCountryType",
    "bucklistNewCandEnrollmentId",
    "bucklistNewCandSubject",
    "bucklistNewCandMessage",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
  const st = $("bucklistSetupEnrollmentStatus");
  if (st) st.value = "Ongoing";
  const r = $("bucklistNewCandResume");
  const cv = $("bucklistNewCandCover");
  if (r) r.value = "";
  if (cv) cv.value = "";
  syncBucklistNewCandDayField();
}

function clearBucklistBandSetupModal() {
  const sharedEl = $("bucklistSetupSharedApplied");
  if (sharedEl) sharedEl.value = "0";
  clearBucklistSetupNewCandidateFields();
  updateBucklistSetupBacklogHint();
  const resEl = $("bucklistSetupResult");
  if (resEl) {
    resEl.classList.add("d-none");
    resEl.textContent = "";
  }
  syncBucklistSetupHrFocusUi();
}

/** @param {string|null} presetApiKey — lock band when opening from a column Band setup */
async function openBucklistBandSetupModal(presetApiKey) {
  if (!lastBucklistData) await refreshBucklist();
  setBucklistSetupBandLocked(presetApiKey || null);
  const apiKey = bucklistSetupCurrentBandKey();
  syncBucklistSetupSubtitleForBand(apiKey);
  const rows = (lastBucklistData?.buckets || {})[apiKey] || [];

  const tEl = $("bucklistSetupTitle");
  if (tEl) {
    const bandPart = presetApiKey ? ` · ${BUCKLIST_BAND_LABELS[apiKey] || apiKey}` : "";
    tEl.textContent = presetApiKey ? `Band setup${bandPart}` : "Band setup";
  }

  const sharedEl = $("bucklistSetupSharedApplied");
  let defShared = 0;
  if (rows.length && rows[0].smart_baseline_applied != null) {
    defShared = Math.max(0, parseInt(String(rows[0].smart_baseline_applied), 10) || 0);
  }
  if (sharedEl) sharedEl.value = String(defShared);

  const resEl = $("bucklistSetupResult");
  if (resEl) {
    resEl.classList.add("d-none");
    resEl.textContent = "";
  }
  clearBucklistSetupNewCandidateFields();
  syncBucklistNewCandDayField();
  updateBucklistSetupBacklogHint();
  syncBucklistSetupHrFocusUi();
  bootstrap.Modal.getOrCreateInstance($("bucklistBandSetupModal")).show();
}

function wireBucklistSetupGrid() {
  const grid = $("bucklistGrid");
  if (!grid || grid.dataset.buckSetupWire) return;
  grid.dataset.buckSetupWire = "1";
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".tt-bucklist-setup-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const attr = btn.getAttribute("data-buck-setup");
    if (!attr) return;
    void openBucklistBandSetupModal(bucklistAutoAttrToApiKey(attr));
  });
}

function bucklistSetupResetBandFooterButtons() {
  const saveBtn = $("bucklistSetupSaveBtn");
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="bi bi-floppy2 me-1"></i> Save';
  }
}

/** Profile “Apps done” for this band row only — never the shared modal field for existing members. */
function bucklistBaselineAppliedFromRow(row) {
  return Math.max(0, parseInt(String(row?.smart_baseline_applied ?? 0), 10) || 0);
}

/** Bucklist Band setup: save smart-service + optional new candidate only (no workflow scheduling — use 6-Month Service). */
async function bucklistBandSetupApply() {
  const apiKey = bucklistSetupCurrentBandKey();
  const resEl = $("bucklistSetupResult");
  const sharedApplied = Math.max(0, parseInt($("bucklistSetupSharedApplied")?.value || "0", 10) || 0);
  const rows = (lastBucklistData?.buckets || {})[apiKey] || [];

  const name = ($("bucklistNewCandName") && $("bucklistNewCandName").value.trim()) || "";
  const email = ($("bucklistNewCandEmail") && $("bucklistNewCandEmail").value.trim()) || "";
  const hasNew = !!(name && email);

  if (!rows.length && !hasNew) {
    toast("No one in this band yet — add a new candidate below, or choose another band.", "warning");
    return;
  }

  const saveBtn = $("bucklistSetupSaveBtn");
  const spin = '<span class="spinner-border spinner-border-sm me-1"></span>';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `${spin}Saving…`;
  }

  const errors = [];
  let ok = 0;
  try {
    for (const row of rows) {
      const id = row.id;
      if (row.days == null) {
        errors.push(`${row?.name || `#${id}`}: missing tenure day # — fix on Candidates tab.`);
        continue;
      }
      const d0 = Math.max(0, parseInt(row.days, 10) || 0);
      const a0Profile = bucklistBaselineAppliedFromRow(row);
      try {
        await apiJson(`/api/candidates/${id}/smart-service`, {
          method: "POST",
          body: JSON.stringify({
            days_in_system: d0,
            smart_baseline_applied: a0Profile,
          }),
        });
        ok += 1;
      } catch (err) {
        errors.push(`${row.name || id}: ${err.message || "failed"}`);
      }
    }

    if (hasNew) {
      const cat = apiKey;
      const b = BUCKLIST_CAT_BOUNDS[cat];
      const days = parseInt($("bucklistNewCandDay")?.value, 10);
      if (!b || Number.isNaN(days) || days < b[0] || (b[1] < 999999 && days > b[1])) {
        errors.push("New candidate: choose a day number that fits this band.");
      } else {
        const baseline = sharedApplied;
        const countryVal = ($("bucklistNewCandCountryType") && $("bucklistNewCandCountryType").value.trim()) || "";
        const indRaw = ($("bucklistNewCandIndustryTypes") && $("bucklistNewCandIndustryTypes").value.trim()) || "";
        const smartIndFollowUp = (indRaw.split(",")[0] || "").trim();
        const fd = new FormData();
        fd.append("name", name);
        fd.append("email", email);
        fd.append("pa_member", ($("bucklistNewCandPaMember") && $("bucklistNewCandPaMember").value.trim()) || "");
        const rmMember = ($("bucklistNewCandRmMember") && $("bucklistNewCandRmMember").value.trim()) || "";
        const poVal = ($("bucklistNewCandPlacementOfficer") && $("bucklistNewCandPlacementOfficer").value.trim()) || "";
        fd.append("rm_member", rmMember);
        fd.append("placement_officer_member", poVal);
        fd.append("app_password", ($("bucklistNewCandAppPwd") && $("bucklistNewCandAppPwd").value) || "");
        fd.append("subject_template", ($("bucklistNewCandSubject") && $("bucklistNewCandSubject").value) || "");
        fd.append("message_template", ($("bucklistNewCandMessage") && $("bucklistNewCandMessage").value) || "");
        fd.append("roles_text", ($("bucklistNewCandRoles") && $("bucklistNewCandRoles").value) || "");
        fd.append("enrollment_id", ($("bucklistNewCandEnrollmentId") && $("bucklistNewCandEnrollmentId").value.trim()) || "");
        fd.append(
          "enrollment_status",
          $("bucklistSetupEnrollmentStatus") ? String($("bucklistSetupEnrollmentStatus").value || "Ongoing") : "Ongoing"
        );
        fd.append("industry_types", indRaw);
        fd.append("smart_country", countryVal);
        fd.append("country_type", countryVal);
        fd.append("bucklist_days_in_system", String(days));
        const resumeEl = $("bucklistNewCandResume");
        const coverEl = $("bucklistNewCandCover");
        if (resumeEl?.files?.[0]) fd.append("resume", resumeEl.files[0]);
        if (coverEl?.files?.[0]) fd.append("coverLetter", coverEl.files[0]);
        try {
          const res = await apiForm("/api/candidates", fd);
          const savedId = res?.candidate?.id;
          if (savedId) {
            try {
              await apiJson(`/api/candidates/${savedId}/smart-service`, {
                method: "POST",
                body: JSON.stringify({
                  days_in_system: days,
                  smart_baseline_applied: baseline,
                  smart_country: countryVal || undefined,
                  smart_industry: smartIndFollowUp || undefined,
                }),
              });
            } catch (e) {
              console.warn("smart-service after new candidate", e);
            }
            ok += 1;
          }
        } catch (err) {
          errors.push(`New candidate: ${err.message || "save failed"}`);
        }
      }
    }

    if (ok === 0 && errors.length) {
      toast(errors.slice(0, 3).join(" — "), "danger");
      if (resEl) {
        resEl.classList.remove("d-none", "text-success");
        resEl.classList.add("text-danger");
        resEl.innerHTML = errors.map((x) => escapeHtml(x)).join("<br>");
      }
      return;
    }
    const verb = "Saved baseline/profile for";
    if (errors.length && ok > 0) {
      toast(`${verb} ${ok}. Some skipped: ${errors[0]}`, "warning");
    } else {
      toast(`${verb} ${ok} candidate(s).`, "success");
    }
    bootstrap.Modal.getInstance($("bucklistBandSetupModal"))?.hide();
    await refreshWorkflowPlans();
    await refreshBucklist();
  } finally {
    bucklistSetupResetBandFooterButtons();
  }
}

function wireBucklistSetupFormOnce() {
  const m = $("bucklistBandSetupModal");
  if (!m || m.dataset.buckSetupFormWired) return;
  m.dataset.buckSetupFormWired = "1";
  m.addEventListener("hidden.bs.modal", () => {
    setBucklistSetupBandLocked(null);
    syncBucklistSetupHrFocusUi();
  });
  $("bucklistSetupBandSelect")?.addEventListener("change", () => {
    if (!bucklistSetupLockedBandKey) {
      const key = bucklistSetupCurrentBandKey();
      syncBucklistSetupSubtitleForBand(key);
      syncBucklistSetupHrFocusUi();
    }
    syncBucklistNewCandDayField();
    updateBucklistSetupBacklogHint();
  });
  $("bucklistSetupSharedApplied")?.addEventListener("input", updateBucklistSetupBacklogHint);
  $("bucklistNewCandDay")?.addEventListener("input", updateBucklistSetupBacklogHint);
  $("bucklistNewCandDay")?.addEventListener("change", updateBucklistSetupBacklogHint);
  $("bucklistSetupClearBtn")?.addEventListener("click", () => clearBucklistBandSetupModal());
  $("bucklistSetupSaveBtn")?.addEventListener("click", () => void bucklistBandSetupApply());
}


function bucklistDefaultDaysForCategory(cat) {
  const b = BUCKLIST_CAT_BOUNDS[cat];
  if (!b) return "";
  const [lo, hi] = b;
  const mid = Math.round((lo + Math.min(hi, lo + 90)) / 2);
  const def = cat === ">180" ? 200 : Math.min(Math.max(mid, lo), hi > 100000 ? 200 : hi);
  return String(def);
}

function bucklistUnassignedSelectOptionsHtml() {
  const rows = [
    ["", "— Range —"],
    ["0-30", "0 – 30 days"],
    ["31-60", "31 – 60 days"],
    ["61-90", "61 – 90 days"],
    ["91-120", "91 – 120 days"],
    ["121-150", "121 – 150 days"],
    ["151-180", "151 – 180 days"],
    [">180", "More than 180 days"],
  ];
  return rows
    .map(([v, t]) => `<option value="${String(v).replace(/"/g, "&quot;")}">${escapeHtml(t)}</option>`)
    .join("");
}

/** Maps API bucket key to `data-buck-range` on the Bucklist grid (HTML uses gt180 for >180). */
function bucklistCellAttrForApiKey(apiKey) {
  return apiKey === ">180" ? "gt180" : apiKey;
}

/** Mirrors server bucket_key_for_days — used when /api/bucklist is unavailable. */
function bucketKeyForBucklistDays(days) {
  const d = Math.max(0, parseInt(days, 10) || 0);
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  if (d <= 120) return "91-120";
  if (d <= 150) return "121-150";
  if (d <= 180) return "151-180";
  return ">180";
}

function bucklistBandDisplayLabel(apiKey) {
  if (!apiKey) return "—";
  const m = {
    "0-30": "0–30",
    "31-60": "31–60",
    "61-90": "61–90",
    "91-120": "91–120",
    "121-150": "121–150",
    "151-180": "151–180",
    ">180": ">180",
  };
  return m[apiKey] || apiKey;
}

/** Pause or resume 6-Month workflow plans when enrollment changes (On Hold / Completed vs Ongoing). */
async function syncWorkflowAutomationWithEnrollment(candidateId, enrollmentStatus) {
  const cid = parseInt(candidateId, 10);
  if (Number.isNaN(cid)) return;
  const st = (enrollmentStatus || "Ongoing").trim();
  let plans;
  try {
    plans = await apiJson("/api/workflow-plans");
  } catch (e) {
    console.warn("workflow-plans for enrollment sync", e);
    return;
  }
  const mine = plans.filter((p) => Number(p.candidate_id) === cid);
  let paused = 0;
  let resumed = 0;
  for (const p of mine) {
    const isPaused = p.status === "paused" || p.is_paused;
    const isTerminal = p.status === "completed" || p.status === "expired";
    if (isTerminal) continue;
    try {
      if (st === "Ongoing") {
        if (isPaused) {
          await apiJson(`/api/workflow-plans/${p.id}`, { method: "PUT", body: JSON.stringify({ action: "resume" }) });
          resumed += 1;
        }
      } else if (st === "On Hold" || st === "Completed") {
        if (!isPaused) {
          await apiJson(`/api/workflow-plans/${p.id}`, { method: "PUT", body: JSON.stringify({ action: "pause" }) });
          paused += 1;
        }
      }
    } catch (err) {
      console.warn("enrollment workflow sync", p.id, err);
    }
  }
  if (paused || resumed) {
    await refreshWorkflowPlans();
    bucklistRepaintOpenBandIfAny();
  }
  if (resumed) toast(`6-Month Service automation resumed (${resumed} plan${resumed === 1 ? "" : "s"}).`, "success");
  if (paused) toast(`6-Month Service automation paused (${paused} plan${paused === 1 ? "" : "s"}) — enrollment: ${st}.`, "info");
}

function computeDaysForBucklistClient(c) {
  const d = c.days_in_system_computed;
  if (d != null && d !== "" && !Number.isNaN(Number(d))) {
    return Math.max(0, parseInt(d, 10));
  }
  if (c.bucklist_days_in_system != null && c.bucklist_days_in_system !== "") {
    return Math.max(0, parseInt(c.bucklist_days_in_system, 10));
  }
  return null;
}

/** Builds the same shape as GET /api/bucklist from /api/candidates summaries. */
function buildBucklistDataFromCandidates(cands) {
  const buckets = {
    "0-30": [],
    "31-60": [],
    "61-90": [],
    "91-120": [],
    "121-150": [],
    "151-180": [],
    ">180": [],
  };
  const unassigned = [];
  if (!Array.isArray(cands)) return { buckets, unassigned };
  const summarySrcToBucklist = {
    profile_service_start: "service_start",
    workflow_plan: "workflow_plan",
    workspace_service: "workspace_service",
    bucklist_pin: "bucklist",
    created_age: "estimated",
  };
  for (const c of cands) {
    const days = computeDaysForBucklistClient(c);
    let days_source =
      c.days_in_system_source && summarySrcToBucklist[c.days_in_system_source]
        ? summarySrcToBucklist[c.days_in_system_source]
        : c.days_in_system_source || null;
    if (!days_source && days != null) {
      if (c.bucklist_days_in_system != null && c.bucklist_days_in_system !== "") days_source = "bucklist";
      else if (c.smart_service_start_date) days_source = "service_start";
      else days_source = "estimated";
    }
    const entry = {
      id: c.id,
      name: c.name,
      email: c.email,
      days,
      bucklist_days_in_system: c.bucklist_days_in_system != null ? c.bucklist_days_in_system : null,
      days_source,
      country_type: (c.country_type || "").trim(),
      industry_types: (c.industry_types || "").trim(),
      updated_at: c.updated_at || "",
      smart_baseline_applied: c.smart_baseline_applied != null ? parseInt(c.smart_baseline_applied, 10) || 0 : 0,
      smart_country: (c.smart_country || "").trim(),
      smart_industry: (c.smart_industry || "").trim(),
    };
    if (days === null) {
      unassigned.push(entry);
      continue;
    }
    const key = bucketKeyForBucklistDays(days);
    if (buckets[key]) buckets[key].push(entry);
  }
  return { buckets, unassigned };
}

function bucklistCardMetaHtml(c) {
  const ct = ((c.smart_country || "").trim() || (c.country_type || "").trim());
  const ind = ((c.smart_industry || "").trim() || (c.industry_types || "").trim());
  if (!ct && !ind) return "";
  const bits = [];
  if (ct) bits.push(`<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">${escapeHtml(ct)}</span>`);
  if (ind) {
    const short = ind.length > 44 ? `${ind.slice(0, 41)}…` : ind;
    bits.push(`<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" title="${escapeHtml(ind)}">${escapeHtml(short)}</span>`);
  }
  return `<div class="tt-bucklist-meta d-flex flex-wrap gap-1 mt-1 lh-sm">${bits.join("")}</div>`;
}

function bucklistUpdatedLineHtml(c) {
  const iso = c.updated_at;
  if (!iso) return "";
  const lbl = formatDateTime(iso);
  return `<div class="tt-bucklist-updated text-muted mt-1" style="font-size:0.7rem;" title="Last time this candidate record was saved (any coordinator)">Updated ${escapeHtml(lbl)}</div>`;
}

function bucklistDaysSourceBadge(c) {
  if (c.days_source === "bucklist") {
    return '<span class="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 ms-1" title="Tenure pinned on candidate profile">saved</span>';
  }
  if (!c.days_source) return "";
  if (c.days_source === "workflow_plan") {
    return '<span class="badge rounded-pill bg-info bg-opacity-10 text-info border border-info border-opacity-25 ms-1" title="Live days from active 6-Month service plan">6mo</span>';
  }
  const tip =
    c.days_source === "service_start"
      ? "Live days from profile service start date"
      : c.days_source === "workspace_service"
        ? "Live days from workspace service start"
        : "Estimated from record age (tenure not pinned)";
  return `<span class="badge rounded-pill bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25 ms-1" title="${escapeHtml(tip)}">auto</span>`;
}

function bucklistBucketSearchNormalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bucklistCandidateSearchHay(c) {
  return bucklistBucketSearchNormalize(
    [c.name, c.email, c.country_type, c.industry_types, c.roles_text].filter(Boolean).join(" ")
  );
}

function bucklistCsvEscapeCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV for the expanded band: same filter as the table (bucket search). */
async function bucklistDownloadOpenBandCsv() {
  const apiKey = bucklistOpenBandKey;
  if (!apiKey || !lastBucklistData) {
    toast("Open a bucklist band first.", "warning");
    return;
  }
  const rows = (lastBucklistData?.buckets || {})[apiKey] || [];
  const q = bucklistBucketSearchNormalize($("bucklistBucketSearch")?.value || "");
  const filtered = !q ? rows : rows.filter((c) => bucklistCandidateSearchHay(c).includes(q));
  if (!filtered.length) {
    toast("No rows to export — adjust search or pick a band with candidates.", "warning");
    return;
  }

  let plans = [];
  try {
    plans = await apiJson("/api/workflow-plans");
  } catch (e) {
    console.warn("workflow-plans for bucklist CSV", e);
  }
  const planByCand = new Map();
  for (const p of plans) {
    const k = p.candidate_id;
    if (k != null && !planByCand.has(k)) planByCand.set(k, p);
  }

  const bandLabel = BUCKLIST_WAVE_TITLE[apiKey] || apiKey;
  const headers = [
    "Band",
    "Candidate ID",
    "Name",
    "Email",
    "Tenure day",
    "Day source",
    "Apps done (profile)",
    "Plan progress",
    "Plan status",
    "Phase",
    "Country (HR target)",
    "Industry (HR target)",
  ];
  const lines = [headers.map(bucklistCsvEscapeCell).join(",")];

  for (const c of filtered) {
    const p = planByCand.get(c.id);
    let tenureDay = "";
    if (p && p.elapsed_days != null && p.elapsed_days !== "") {
      tenureDay = String(p.elapsed_days);
    } else if (c.days != null && c.days !== "") {
      tenureDay = String(c.days);
    }
    let daySrc = "auto";
    if (c.days_source === "bucklist") daySrc = "saved";
    else if (c.days_source === "workflow_plan") daySrc = "6mo";

    let planStatus = "No plan";
    if (p) {
      if (p.is_paused || p.status === "paused") planStatus = "Paused";
      else if (p.status === "completed") planStatus = "Completed";
      else if (p.status === "expired") planStatus = "Expired";
      else planStatus = "Active";
    }
    const progress = !p ? "" : `${p.total_applied}/${p.total_target}`;
    const phase = p && p.current_phase != null ? String(p.current_phase) : "";
    const country = ((c.smart_country || "").trim() || (c.country_type || "").trim());
    const industry = ((c.smart_industry || "").trim() || (c.industry_types || "").trim());

    lines.push(
      [
        bandLabel,
        String(c.id),
        c.name || "",
        c.email || "",
        tenureDay,
        daySrc,
        String(bucklistProfileAppsDone(c)),
        progress,
        planStatus,
        phase,
        country,
        industry,
      ]
        .map(bucklistCsvEscapeCell)
        .join(",")
    );
  }

  const blob = new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeKey = String(apiKey).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bucklist-${safeKey}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${filtered.length} row(s).`, "success");
}

/** Updates band badges from data (grid stays compact — no per-candidate cards in columns). */
function applyBucklistBucketSearch() {
  const inp = $("bucklistBucketSearch");
  const q = bucklistBucketSearchNormalize(inp ? inp.value : "");
  const buckets = lastBucklistData?.buckets || {};
  let totalMatches = 0;

  Object.entries(BUCKLIST_UL_IDS).forEach(([key, id]) => {
    const ul = $(id);
    const cell = document.querySelector(`.tt-bucklist-cell[data-buck-range="${bucklistCellAttrForApiKey(key)}"]`);
    const cnt = cell?.querySelector(".tt-bucklist-head-count");
    const rows = buckets[key] || [];
    const total = rows.length;
    let matches = total;
    if (q) {
      matches = rows.filter((c) => bucklistCandidateSearchHay(c).includes(q)).length;
      totalMatches += matches;
    }
    if (cnt) {
      if (q) {
        cnt.textContent = matches === total ? String(matches) : `${matches}/${total}`;
        cnt.classList.toggle("tt-bucklist-head-count--empty", total === 0);
      } else {
        cnt.textContent = String(total);
        cnt.classList.toggle("tt-bucklist-head-count--empty", total === 0);
      }
    }
    cell?.classList.toggle("tt-bucklist-cell--search-miss", !!(q && matches === 0 && total > 0));
    if (ul) ul.classList.toggle("tt-bucklist-ul--muted-search", !!(q && matches === 0 && total > 0));
  });

  const hint = $("bucklistBucketSearchHint");
  const clr = $("bucklistBucketSearchClear");
  if (!q) {
    hint?.classList.add("d-none");
    clr?.classList.add("d-none");
    document.querySelectorAll(".tt-bucklist-ul").forEach((u) => u.classList.remove("tt-bucklist-ul--muted-search"));
    return;
  }
  clr?.classList.remove("d-none");
  if (hint) {
    hint.textContent = `${totalMatches} match${totalMatches === 1 ? "" : "es"} across bands`;
    hint.classList.remove("d-none");
  }
}

function wireBucklistBucketSearchOnce() {
  const inp = $("bucklistBucketSearch");
  const clr = $("bucklistBucketSearchClear");
  if (!inp || inp.dataset.buckSearchWired) return;
  inp.dataset.buckSearchWired = "1";
  inp.addEventListener("input", () => {
    applyBucklistBucketSearch();
    bucklistRepaintOpenBandIfAny();
  });
  clr?.addEventListener("click", () => {
    inp.value = "";
    applyBucklistBucketSearch();
    bucklistRepaintOpenBandIfAny();
    inp.focus();
  });
}

function renderBucklist(data) {
  const buckets = data.buckets || {};
  Object.entries(BUCKLIST_UL_IDS).forEach(([key, id]) => {
      const ul = $(id);
      if (!ul) return;
      ul.className = "tt-bucklist-ul tt-bucklist-ul--compact";
      ul.innerHTML = "";
      const rows = buckets[key] || [];
      const cell = document.querySelector(`.tt-bucklist-cell[data-buck-range="${bucklistCellAttrForApiKey(key)}"]`);
      const cnt = cell?.querySelector(".tt-bucklist-head-count");
      if (cnt) {
        cnt.textContent = String(rows.length);
        cnt.classList.toggle("tt-bucklist-head-count--empty", rows.length === 0);
      }
      if (!rows.length) {
        ul.innerHTML =
          '<li class="tt-bucklist-empty-placeholder text-muted small fst-italic py-2 px-1">No candidates — pin tenure on profile or assign below</li>';
        return;
      }
      ul.innerHTML =
        '<li class="tt-bucklist-open-hint text-muted small py-2 px-1"><span class="fst-italic">Click the <strong class="text-primary">blue title</strong> above or this area to open the list — progress, pause, stop, export, and Analytics.</span></li>';
  });
  const ua = $("bucklistUnassigned");
  if (ua) {
    ua.innerHTML = "";
    const un = data.unassigned || [];
    if (!un.length) {
      ua.innerHTML = '<li class="text-muted small fst-italic">None</li>';
    } else {
      un.forEach((c) => {
        const li = document.createElement("li");
        li.className = "tt-bucklist-unassign-row mb-2 pb-2 border-bottom border-secondary border-opacity-10";
        li.dataset.candidateId = String(c.id);
        const uCt = (c.country_type || "").trim();
        const uInd = (c.industry_types || "").trim();
        const uMeta =
          uCt || uInd
            ? `<div class="small text-muted mt-1">${uCt ? escapeHtml(uCt) : ""}${uCt && uInd ? " · " : ""}${uInd ? escapeHtml(uInd.length > 40 ? uInd.slice(0, 37) + "…" : uInd) : ""}</div>`
            : "";
        const uUpd = bucklistUpdatedLineHtml(c);
        li.innerHTML = `
          <div class="d-flex flex-wrap align-items-center gap-2">
            <div class="flex-grow-1 min-w-0" style="min-width:140px;">
              <div class="fw-medium text-truncate">${escapeHtml(c.name)}</div>
              <div class="small text-muted text-truncate" title="${escapeHtml(c.email)}">${escapeHtml(c.email)}</div>
              ${uMeta}
              ${uUpd}
            </div>
            <select class="form-select form-select-sm bucklist-uassign-cat" style="max-width:160px;" aria-label="Day range">${bucklistUnassignedSelectOptionsHtml()}</select>
            <input type="number" class="form-control form-control-sm bucklist-uassign-days" style="max-width:88px;" min="0" step="1" placeholder="#" disabled aria-label="Day number" />
            <button type="button" class="btn btn-primary btn-sm bucklist-assign-btn">Assign</button>
          </div>`;
        ua.appendChild(li);
      });
    }
  }
  applyBucklistBucketSearch();
  bucklistRepaintOpenBandIfAny();
}

async function refreshBucklist() {
  if (!$("bucklistUl-0-30")) return;
  try {
    const data = await apiJson("/api/bucklist");
    lastBucklistData = data;
    renderBucklist(data);
  } catch (e) {
    console.warn("Bucklist /api/bucklist failed, using /api/candidates fallback:", e);
    try {
      const cands = await apiJson("/api/candidates");
      const built = buildBucklistDataFromCandidates(cands);
      lastBucklistData = built;
      renderBucklist(built);
    } catch (e2) {
      console.error(e2);
      Object.values(BUCKLIST_UL_IDS).forEach((id) => {
        const el = $(id);
        if (el) el.innerHTML = '<li class="text-danger small">Failed to load</li>';
      });
    }
  }
}

function bucklistAssignNotFound(err) {
  const st = err && err.status;
  const m = ((err && err.message) || "").toLowerCase();
  return st === 404 || m.includes("not found");
}

/** When POST /api/bucklist/assign is missing (old server), persist days via profile-fields (multipart ignores these). */
async function bucklistAssignViaCandidatesSave(candidateId, days) {
  const r = await fetch(`/api/candidates/${candidateId}/profile-fields`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ bucklist_days_in_system: days }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Could not save days (HTTP ${r.status}). ${text.slice(0, 300)}`);
  }
}

function wireBucklistUnassignedDelegation() {
  const ua = $("bucklistUnassigned");
  if (!ua || ua.dataset.bucklistWire) return;
  ua.dataset.bucklistWire = "1";
  ua.addEventListener("change", (e) => {
    const sel = e.target.closest(".bucklist-uassign-cat");
    if (!sel) return;
    const row = sel.closest("li[data-candidate-id]");
    if (!row) return;
    const cat = sel.value;
    const daysIn = row.querySelector(".bucklist-uassign-days");
    if (!daysIn) return;
    if (!cat) {
      daysIn.value = "";
      daysIn.disabled = true;
      return;
    }
    daysIn.disabled = false;
    const b = BUCKLIST_CAT_BOUNDS[cat];
    if (!b) return;
    daysIn.min = String(b[0]);
    if (b[1] > 100000) {
      daysIn.removeAttribute("max");
    } else {
      daysIn.max = String(b[1]);
    }
    daysIn.value = bucklistDefaultDaysForCategory(cat);
  });
  ua.addEventListener("click", async (e) => {
    const btn = e.target.closest(".bucklist-assign-btn");
    if (!btn) return;
    const row = btn.closest("li[data-candidate-id]");
    if (!row) return;
    const id = parseInt(row.dataset.candidateId, 10);
    const sel = row.querySelector(".bucklist-uassign-cat");
    const daysIn = row.querySelector(".bucklist-uassign-days");
    if (!sel || !daysIn) return;
    const cat = sel.value;
    if (!cat) {
      toast("Choose a day range first.", "warning");
      return;
    }
    const days = parseInt(daysIn.value, 10);
    if (Number.isNaN(days)) {
      toast("Enter a day number for this range.", "warning");
      return;
    }
    btn.disabled = true;
    try {
      try {
        await apiJson("/api/bucklist/assign", {
          method: "POST",
          body: JSON.stringify({ candidate_id: id, category: cat, days_in_system: days }),
        });
      } catch (err) {
        if (!bucklistAssignNotFound(err)) throw err;
        try {
          await apiJson("/api/bucklist-assign", {
            method: "POST",
            body: JSON.stringify({ candidate_id: id, category: cat, days_in_system: days }),
          });
        } catch (err2) {
          if (!bucklistAssignNotFound(err2)) throw err2;
          await bucklistAssignViaCandidatesSave(id, days);
        }
      }
      toast("Candidate assigned to bucket.", "success");
      await refreshBucklist();
      await refreshCandidates();
    } catch (err) {
      toast((err.message || "Assign failed") + " — restart the server (python server.py) after updating.", "danger");
    } finally {
      btn.disabled = false;
    }
  });
}

/** Derive API category key from numeric days (matches server BUCKLIST_CATEGORY_BOUNDS). */
function bucklistCategoryFromDays(days) {
  return bucketKeyForBucklistDays(days);
}

let _saWorkflowModalBase = null;

function getSaWorkflowModalMergedPayload() {
  const base = _saWorkflowModalBase || {};
  const inp = $("saModalDaysInput");
  const daysRaw = inp ? inp.value : base.days_in_system;
  const days = Math.max(0, parseInt(daysRaw, 10) || 0);
  return normalizeSaPredictionPayload({
    ...base,
    days_in_system: days,
    workflow_phases: [],
    expected_applications_by_now: getExpectedAppliedByDays(days),
  });
}

function renderSaWorkflowPredictionModal() {
  const p = getSaWorkflowModalMergedPayload();
  const summaryEl = $("saWorkflowPhasesSummary");
  const bodyEl = $("saWorkflowPhasesBody");
  const titleEl = $("saWorkflowPhasesModalTitle");
  if (titleEl) {
    titleEl.textContent = `${p.candidate_name || "Candidate"} — Overall plan (1200 applications / 6 months)`;
  }
  const hintEl = $("saForwardPlanHint");
  if (hintEl) {
    const d = p.days_in_system;
    const tgt = p.total_target || 1200;
    const pl = computeSmartAutomationPlanLocal(d, p.total_applied, 100, tgt, 1);
    const tier = getServiceTierForDay(d);
    hintEl.innerHTML =
      `<strong>Workflow prediction (from day ${d}):</strong> P${tier.phase} — ${escapeHtml(tier.label)} · ` +
      `batch cap <strong>${pl.phase_batch_cap}</strong> · ` +
      `days left in 6-month window: <strong>${pl.days_left_in_180_window}</strong> · ` +
      `<span class="${pl.backlog_mode ? "text-warning" : "text-success"}">${pl.backlog_mode ? "Backlog — catch-up applies" : "On track"}</span>`;
  }
  const mileEl = $("saMilestonePlanBody");
  if (mileEl) {
    const rows = saBuildForwardPlanRows(p.days_in_system, p.service_start_utc, p.total_applied, p.total_target || 1200);
    mileEl.innerHTML = rows
      .map((m) => {
        const trCls = m.highlight ? "table-primary" : "";
        const dayCell = m.day === "—" ? "—" : m.day;
        const cumCell = typeof m.cum === "number" ? m.cum : escapeHtml(String(m.cum));
        return `<tr class="${trCls}">
          <td class="small fw-semibold">${escapeHtml(m.dateStr)}</td>
          <td class="small text-center">${dayCell}</td>
          <td class="small text-end">${cumCell}</td>
          <td class="small text-muted">${escapeHtml(m.label)}</td>
        </tr>`;
      })
      .join("");
  }
  const planSt = (p.workflow_plan_status || "").trim();
  const planLine = planSt ? `Workflow plan record: <strong>${escapeHtml(planSt)}</strong>` : "Workflow plan record: —";
  const tgt = p.total_target || 1200;
  const exp =
    typeof p.expected_applications_by_now === "number" && !Number.isNaN(p.expected_applications_by_now)
      ? p.expected_applications_by_now
      : null;
  if (summaryEl) {
    const pct = typeof p.prediction_pct === "number" ? p.prediction_pct : "—";
    const expLine =
      exp !== null
        ? ` On-track target for the day count above: <strong>${exp}</strong> applications (workflow curve).`
        : "";
    summaryEl.innerHTML =
      `<strong>Goal:</strong> up to <strong>${tgt}</strong> job applications (emails) over the service window · ` +
      `<span class="text-primary fw-semibold">${pct}%</span> done · ` +
      `Applied: <strong>${p.total_applied ?? "—"}</strong>${expLine} · ${planLine}` +
      `<br><br><strong>Why “Next batch” can be 0 while Bucket still shows a range:</strong> ` +
      `<span class="text-body">Bucket = which <em>day-range band</em> you are in (e.g. 31–60). ` +
      `It is not a queue of emails. “Next batch” = how many <em>catch-up</em> emails this scheduler run would send. ` +
      `If you are <strong>on track</strong> (applied ≥ today’s curve target), pending = 0 and next batch = 0 — no catch-up needed.</span>` +
      `<br><span class="text-muted small">The scheduler still advances <strong>Next run</strong> on your cadence; when batch is 0, no sends that tick.</span>`;
  }
  if (bodyEl) {
    const phases = Array.isArray(p.workflow_phases) ? p.workflow_phases : [];
    bodyEl.innerHTML = phases
      .map((row) => {
        const badge =
          row.status === "completed"
            ? '<span class="badge bg-success">Completed</span>'
            : row.status === "current"
              ? '<span class="badge bg-primary">Current</span>'
              : '<span class="badge bg-secondary">Upcoming</span>';
        let dateR = "—";
        if (row.period_start) {
          if (row.period_end && row.period_end !== "—") {
            dateR = `${escapeHtml(row.period_start)} → ${escapeHtml(row.period_end)}`;
          } else {
            dateR = `${escapeHtml(row.period_start)} → —`;
          }
        }
        const appsPhase =
          row.phase_app_target != null
            ? row.phase_app_target
            : SA_WF_PHASES[row.phase]
              ? SA_WF_PHASES[row.phase].target
              : "—";
        return `<tr>
          <td class="small text-nowrap">${dateR}</td>
          <td class="small text-end fw-semibold">${appsPhase}</td>
          <td class="small"><span class="fw-semibold">P${row.phase}</span> <span class="text-muted">${escapeHtml(row.label || "")}</span></td>
          <td class="small text-nowrap">${escapeHtml(row.days_range || "")}</td>
          <td class="small text-end">${row.cumulative_target ?? "—"}</td>
          <td class="small text-end">${row.per_batch ?? "—"}</td>
          <td class="small text-center">${badge}</td>
        </tr>`;
      })
      .join("");
  }
}

function openSaWorkflowPredictionModal(raw) {
  _saWorkflowModalBase = { ...(raw || {}) };
  const inp = $("saModalDaysInput");
  if (inp) {
    const d = Math.max(0, parseInt(_saWorkflowModalBase.days_in_system, 10) || 0);
    inp.value = String(d);
  }
  renderSaWorkflowPredictionModal();
  const el = document.getElementById("saWorkflowPhasesModal");
  if (el && window.bootstrap && window.bootstrap.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(el).show();
  }
}

async function refreshSmartAutomationDashboard() {
  const wrap = $("saDashboardBody");
  if (!wrap) return;
  try {
    const data = await apiJsonSmartAutomation("/api/smart-automation/dashboard");
    const rows = data.rows || [];
    if (!rows.length) {
      wrap.innerHTML = `<tr><td colspan="12" class="text-muted small py-3">No active Smart Automation workspaces. Enable automation below to see live status.</td></tr>`;
      return;
    }
    wrap.innerHTML = rows
      .map((r) => {
        const nr = r.next_run_utc ? formatDateTime(r.next_run_utc) : "—";
        const mode = r.backlog_mode
          ? `<span class="badge bg-warning text-dark" title="Catch-up capped at ${r.backlog_safe_cap ?? 100}/day">Backlog</span>`
          : `<span class="badge bg-success">On track</span>`;
        const tgt = Number(r.total_target) > 0 ? Number(r.total_target) : 1200;
        const dDays = Number(r.days_in_system ?? 0);
        const dApplied = Number(r.total_applied ?? 0);
        const dPct =
          typeof r.prediction_pct === "number" && !Number.isNaN(r.prediction_pct)
            ? r.prediction_pct
            : "";
        const dExp =
          r.expected_applications_by_now != null && r.expected_applications_by_now !== ""
            ? Number(r.expected_applications_by_now)
            : "";
        const phaseCap = r.phase_batch_cap != null && r.phase_batch_cap !== "" ? Number(r.phase_batch_cap) : "";
        const nb = Number(r.next_batch ?? 0);
        const nextBatchInner = r.backlog_mode
          ? `<div><strong>${nb}</strong><div class="text-muted" style="font-size:0.65rem">catch-up</div></div>`
          : `<div><strong>${nb}</strong><div class="text-muted" style="font-size:0.65rem" title="On track: no catch-up this run. Bucket = day band only.">on track${phaseCap !== "" ? ` · up to ${phaseCap}/run if behind` : ""}</div></div>`;
        const predBtn = `<button type="button" class="btn btn-light border btn-sm py-0 px-1 ms-1 align-middle sa-wf-prediction-btn"
          data-sa-days="${dDays}"
          data-sa-applied="${dApplied}"
          data-sa-target="${tgt}"
          data-sa-pct="${dPct}"
          data-sa-expected="${dExp}"
          data-sa-service="${encodeURIComponent(r.service_start_utc || "")}"
          data-sa-plan="${encodeURIComponent(r.workflow_plan_status || "")}"
          data-sa-name="${encodeURIComponent(r.candidate_name || "")}"
          title="Overall plan — 1200 goal, dates & phases"><i class="bi bi-graph-up-arrow text-primary"></i><span class="small fw-bold text-primary ms-1">100%</span></button>`;
        return `<tr>
          <td class="small fw-semibold">${escapeHtml(r.candidate_name || "")}</td>
          <td class="small">${escapeHtml(r.po_name || "—")}</td>
          <td class="small text-center">${r.total_applied ?? "—"}</td>
          <td class="small text-center">${r.days_in_system ?? "—"}</td>
          <td class="small"><span class="badge bg-secondary" title="Day-range band in service (not a send queue)">${escapeHtml(r.days_bucket || "")}</span></td>
          <td class="small">${escapeHtml(r.phase_label || "")}</td>
          <td class="small">${escapeHtml(r.industry || "")}</td>
          <td class="small">${escapeHtml(r.country || "")}</td>
          <td class="small text-center">${mode}</td>
          <td class="small text-center">${r.pending_on_track ?? "—"}</td>
          <td class="small text-center">${nextBatchInner}</td>
          <td class="small text-nowrap">${nr}${predBtn}</td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    const line = shortApiError(e.message) + smartApiDeployHint(e.message);
    wrap.innerHTML = `<tr><td colspan="12" class="text-danger small">${escapeHtml(line)}</td></tr>`;
  }
}

async function refreshSmartAutomation() {
  const box = $("saCandList");
  if (!box) return;
  try {
    const cands = await apiJson("/api/candidates");
    box.innerHTML = "";
    cands.forEach((c) => {
      const ind = (c.industry_types || "").trim();
      const lab = ind ? `${c.name} (${c.email}) — ${ind}` : `${c.name} (${c.email})`;
      const div = document.createElement("div");
      div.className = "form-check sa-cand-row py-1 border-bottom border-opacity-10";
      div.dataset.filterText = `${(c.name || "").toLowerCase()} ${(c.email || "").toLowerCase()} ${ind.toLowerCase()}`;
      div.innerHTML = `<input class="form-check-input sa-cand-cb" type="checkbox" value="${c.id}" id="sa_c_${c.id}">
        <label class="form-check-label small" for="sa_c_${c.id}">${escapeHtml(lab)}</label>`;
      box.appendChild(div);
    });
    filterSaCandList();
    const indList = await apiJson("/api/targets/industries");
    const countries = new Set();
    indList.forEach((i) => (i.countries || []).forEach((ct) => countries.add(ct)));
    if (!countries.size) countries.add("Global");
    populateSelect($("saCountry"), [...countries].sort(), "Country");
    const names = indList.map((i) => i.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    if (!names.length) names.push("Default");
    populateSelect($("saIndustry"), names, "Industry");

    const dEl = $("saStartDate");
    if (dEl && !dEl.value) {
      const t = new Date();
      if (t.getHours() >= 12) t.setDate(t.getDate() + 1);
      t.setHours(12, 0, 0, 0);
      dEl.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    }
    await refreshSmartAutomationDashboard();
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="text-danger small">Could not load data.</div>`;
  }
}

function smartAutoNextRunIso() {
  const dEl = $("saStartDate");
  const hEl = $("saStartHour");
  const mEl = $("saStartMinute");
  const aEl = $("saStartAmPm");
  if (!dEl || !dEl.value) return "";
  let hour = parseInt(hEl?.value || "12", 10);
  let minute = parseInt(mEl?.value || "0", 10) || 0;
  minute = Math.max(0, Math.min(59, minute));
  if (mEl) mEl.value = String(minute).padStart(2, "0");
  const ap = aEl?.value || "PM";
  if (ap === "PM" && hour !== 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  const local = new Date(`${dEl.value}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  return local.toISOString();
}

function getSelectedSaCandidateIds() {
  return [...document.querySelectorAll(".sa-cand-cb:checked")]
    .map((cb) => parseInt(cb.value, 10))
    .filter((n) => !Number.isNaN(n));
}

function smartAutoEffectiveDays() {
  return Math.max(0, parseInt($("saDays")?.value || "0", 10) || 0);
}

function runSmartAutoPreview() {
  const out = $("saPreviewOut");
  if (!out) return;
  const days = smartAutoEffectiveDays();
  const appliedTotal = Math.max(0, parseInt($("saTotalApplied")?.value || "0", 10) || 0);
  const maxPerRun = Math.max(1, parseInt($("saMaxPerRun")?.value || "100", 10) || 100);
  const interval = Math.max(1, parseInt($("saInterval")?.value || "1", 10) || 1);
  try {
    const plan = computeSmartAutomationPlanLocal(days, appliedTotal, maxPerRun, 1200, interval);
    const behindAhead = plan.on_track_delta === 0
      ? "On track"
      : (plan.on_track_delta > 0 ? `${plan.on_track_delta} ahead of curve` : `${Math.abs(plan.on_track_delta)} behind curve`);
    const iso = smartAutoNextRunIso();
    const pending = plan.pending_on_track;
    const nextRun = plan.suggested_batch_per_run;
    const cadenceLabel = interval === 1 ? "every day" : `every ${interval} days`;
    const catchUpLine = plan.backlog_mode
      ? `Backlog catch-up — next run up to <strong>${nextRun}</strong> email(s) (capped at <strong>${plan.backlog_safe_cap}</strong> per day to clear backlog safely).`
      : `On track — curve needs <strong>0</strong> catch-up emails right now (calculated batch).`;
    out.innerHTML = `
      <ul class="list-unstyled mb-0 small text-body">
        <li><strong>Days bucket</strong>: <span class="badge bg-secondary">${escapeHtml(plan.days_bucket)}</span> &nbsp;|&nbsp; <strong>Days in system</strong>: ${days}</li>
        <li><strong>Phase</strong> ${plan.phase}: ${escapeHtml(plan.phase_label)}</li>
        <li><strong>On-track target today</strong>: ${plan.expected_applications_by_now} &nbsp;|&nbsp; <strong>Total applied</strong> (you entered): ${appliedTotal}</li>
        <li><strong>Pending</strong> (target − applied): <span class="badge bg-warning text-dark">${pending}</span> &nbsp;— ${behindAhead}</li>
        <li>${catchUpLine}</li>
        <li><strong>Remaining to 1200 cap</strong>: ${plan.remaining_to_cap}</li>
        <li><strong>Cadence</strong>: ${cadenceLabel} · <strong>Delay</strong>: 15s between emails</li>
        <li class="text-muted mt-2 mb-0"><strong>First run</strong>: ${iso ? formatDateTime(iso) : "Set date & time"}</li>
      </ul>`;
  } catch (e) {
    out.innerHTML = `<span class="text-danger">${escapeHtml(shortApiError(e.message))}</span>`;
  }
}

async function runSmartAutoApply() {
  const ids = getSelectedSaCandidateIds();
  if (!ids.length) {
    alert("Select at least one candidate.");
    return;
  }
  const country = $("saCountry")?.value || "";
  const industry = $("saIndustry")?.value || "";
  if (!country || !industry) {
    alert("Choose country and industry for the HR list.");
    return;
  }
  const days = smartAutoEffectiveDays();
  const applied = Math.max(0, parseInt($("saTotalApplied")?.value || "0", 10) || 0);
  const maxPerRun = Math.max(1, parseInt($("saMaxPerRun")?.value || "100", 10) || 100);
  const interval = Math.max(1, parseInt($("saInterval")?.value || "1", 10) || 1);
  const iso = smartAutoNextRunIso();
  if (!iso) {
    alert("Please set a first run date.");
    return;
  }
  const appliedTotal = applied;
  const pre = computeSmartAutomationPlanLocal(days, appliedTotal, maxPerRun, 1200, interval);
  if (pre.suggested_batch_per_run <= 0) {
    alert("You are on track with the curve — no catch-up emails to schedule right now. If you still need sends, check your totals or try again after more days pass.");
    return;
  }
  const cadence = interval === 1 ? "daily" : `every ${interval} days`;
  const capNote = pre.backlog_mode ? ` (backlog safe cap ${pre.backlog_safe_cap}/day)` : "";
  if (!confirm(`Enable Smart Automation for ${ids.length} candidate(s)?\n\nDays in system: ${days}. Total applications: ${appliedTotal}.\nNext run: up to ${pre.suggested_batch_per_run} email(s)${capNote}, ${cadence}. 15s delay between emails.\n\nContinue?`)) return;
  try {
    const res = await apiJsonSmartAutomation("/api/smart-automation/apply", {
      method: "POST",
      body: JSON.stringify({
        candidate_ids: ids,
        days_in_system: Math.max(0, parseInt($("saDays")?.value || "0", 10) || 0),
        days,
        applied: appliedTotal,
        country,
        industry,
        max_per_run: maxPerRun,
        interval_days: interval,
        next_run_iso: iso
      })
    });
    runSmartAutoPreview();
    alert(res.message || "Saved.");
    refreshWorkspaces();
    refreshSmartAutomationDashboard();
  } catch (e) {
    alert((shortApiError(e.message) || "Apply failed") + smartApiDeployHint(e.message));
  }
}

const TT_DASH_BUCK_ORDER = ["0-30", "31-60", "61-90", "91-120", "121-150", "151-180", ">180"];
const TT_DASH_BUCK_LABELS = {
  "0-30": "0 – 30 days",
  "31-60": "31 – 60",
  "61-90": "61 – 90",
  "91-120": "91 – 120",
  "121-150": "121 – 150",
  "151-180": "151 – 180",
  ">180": "> 180",
};
const TT_DASH_BUCK_COLORS = ["#38bdf8", "#22d3ee", "#2dd4bf", "#4ade80", "#facc15", "#fb923c", "#a78bfa"];

function _wfTrackerPhaseBadgeClass(phase) {
  if (phase.roll === "upcoming") return "tt-dash-wf-badge tt-dash-wf-badge--soon";
  if (phase.target_met === true) return "tt-dash-wf-badge tt-dash-wf-badge--yes";
  if (phase.target_met === false) return phase.roll === "past" ? "tt-dash-wf-badge tt-dash-wf-badge--miss" : "tt-dash-wf-badge tt-dash-wf-badge--wip";
  return "tt-dash-wf-badge tt-dash-wf-badge--soon";
}

function renderDashWfTracker(trackerPayload) {
  const host = $("ttDashWfTracker");
  if (!host) return;
  const data = trackerPayload && typeof trackerPayload === "object" ? trackerPayload : {};
  const planList = Array.isArray(data.plans) ? data.plans : [];
  if (!planList.length) {
    host.innerHTML =
      '<p class="text-muted small mb-0">No candidates in the system yet.</p>';
    return;
  }
  const withPhases = planList.find((p) => (p.phases || []).length > 0);
  const phaseCount = withPhases?.phases?.length || 7;
  const thPhases = Array.from({ length: phaseCount }, (_, i) => {
    const n = i + 1;
    return `<th class="tt-dash-wf-th-phase text-center" scope="col" title="Phase ${n}">P${n}</th>`;
  }).join("");
  const rows = planList
    .map((plan) => {
      if (plan.has_plan === false) {
        return `<tr class="tt-dash-wf-row--noplan">
        <td class="tt-dash-wf-td-name">
          <div class="fw-semibold">${escapeHtml(plan.candidate_name || "—")}</div>
          <div class="small text-muted">ID ${plan.candidate_id}</div>
        </td>
        <td><span class="badge text-bg-light text-dark border">No plan</span></td>
        <td class="text-muted">—</td>
        <td class="text-muted">—</td>
        <td colspan="${phaseCount}" class="tt-dash-wf-no-plan-cell text-center text-muted py-3">
          No 6-month workflow plan yet. Open <strong>6-Month Service</strong> to create one for this candidate.
        </td>
      </tr>`;
      }
      const st = (plan.plan_status || "active").toLowerCase();
      const stCls =
        st === "active" ? "text-bg-success" : st === "paused" ? "text-bg-warning text-dark" : "text-bg-secondary";
      const expToday =
        plan.expected_for_today != null && plan.expected_for_today !== undefined
          ? plan.expected_for_today
          : null;
      const appliedN = plan.total_applied ?? 0;
      const delta =
        plan.applications_ahead_or_behind != null && plan.applications_ahead_or_behind !== undefined
          ? plan.applications_ahead_or_behind
          : expToday != null
            ? appliedN - expToday
            : null;
      const onTrack = plan.on_track === true;
      const trackBadge = expToday == null
        ? ""
        : onTrack
          ? '<span class="tt-dash-wf-badge tt-dash-wf-badge--yes">On track</span>'
          : '<span class="tt-dash-wf-badge tt-dash-wf-badge--miss">Behind curve</span>';
      const deltaHtml =
        delta == null
          ? ""
          : `<span class="tt-dash-wf-meta ms-1">${delta >= 0 ? "+" : ""}${delta} vs curve</span>`;

      const cells = (plan.phases || [])
        .map((ph) => {
          const dateLine =
            ph.period_start && ph.period_end
              ? `${escapeHtml(ph.period_start)} → ${escapeHtml(ph.period_end)}`
              : "—";
          const curveHint =
            ph.expected_applications != null && ph.benchmark_day != null
              ? `need ${ph.expected_applications} @ day ${ph.benchmark_day}`
              : ph.roll === "upcoming" && ph.cumulative_target != null
                ? `end of band: ${ph.cumulative_target} apps`
                : "";
          const lab = escapeHtml(ph.achieved_label || "—");
          const badgeCls = _wfTrackerPhaseBadgeClass(ph);
          const rollHint =
            ph.roll === "upcoming"
              ? "Scheduled"
              : ph.roll === "current"
                ? "Current"
                : "Ended";
          return `<td class="tt-dash-wf-td-phase">
            <div class="tt-dash-wf-date">${dateLine}</div>
            ${curveHint ? `<div class="tt-dash-wf-curve-hint">${escapeHtml(curveHint)}</div>` : ""}
            <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
              <span class="${badgeCls}">${lab}</span>
            </div>
            <div class="tt-dash-wf-roll">${rollHint}</div>
          </td>`;
        })
        .join("");
      const planMeta =
        plan.plan_id != null ? `ID ${plan.candidate_id} · plan #${plan.plan_id}` : `ID ${plan.candidate_id}`;
      return `<tr>
        <td class="tt-dash-wf-td-name">
          <div class="fw-semibold">${escapeHtml(plan.candidate_name || "—")}</div>
          <div class="small text-muted">${planMeta}</div>
        </td>
        <td><span class="badge ${stCls} text-capitalize">${escapeHtml(plan.plan_status || "")}</span></td>
        <td class="text-nowrap">${plan.elapsed_days != null ? plan.elapsed_days : "—"}</td>
        <td class="tt-dash-wf-td-apps">
          <div class="fw-semibold">${plan.total_applied ?? "—"} / ${plan.total_target ?? "—"} <span class="text-muted fw-normal small">apps</span></div>
          ${
            expToday != null && plan.elapsed_days != null
              ? `<div class="small text-muted mt-1">Curve for <strong>day ${plan.elapsed_days}</strong>: need <strong>${expToday}</strong> applied</div>`
              : ""
          }
          ${trackBadge ? `<div class="d-flex flex-wrap align-items-center mt-1">${trackBadge}${deltaHtml}</div>` : ""}
        </td>
        ${cells}
      </tr>`;
    })
    .join("");
  host.innerHTML = `<div class="table-responsive tt-dash-wf-table-wrap">
    <table class="table table-sm table-hover align-middle mb-0 tt-dash-wf-table">
      <thead>
        <tr>
          <th scope="col">Candidate</th>
          <th scope="col">Plan</th>
          <th scope="col" title="Days since service start (service day)">Day</th>
          <th scope="col" title="Applied jobs vs official day curve (linear milestones to 1200)">Apps vs curve</th>
          ${thPhases}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/** Coalesce overlapping overview refreshes (setActiveTab + init both call this). */
let _overviewDashboardPromise = null;

async function refreshOverviewDashboard() {
  if (_overviewDashboardPromise) return _overviewDashboardPromise;

  const setText = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
  };

  const clearLoadingIfStuck = () => {
    const sub = $("ttDashStatCandSub");
    if (!sub) return;
    const t = (sub.textContent || "").trim();
    if (/loading/i.test(t)) sub.textContent = "Click Refresh overview above";
  };

  _overviewDashboardPromise = (async () => {
    try {
      const [candsRaw, buckRaw, plansRaw, tgRaw, pipeRaw, meRaw, wfTrackRaw] = await Promise.all([
        apiJson("/api/candidates").catch(() => null),
        apiJson("/api/bucklist").catch(() => null),
        apiJson("/api/workflow-plans").catch(() => null),
        apiJson("/api/targets/summary").catch(() => null),
        apiJson("/api/results/stats").catch(() => null),
        apiJson("/api/auth/me").catch(() => null),
        apiJson("/api/dashboard/workflow-phase-tracker").catch(() => null),
      ]);

      const cands = Array.isArray(candsRaw) ? candsRaw : [];
      if (meRaw && meRaw.authenticated && meRaw.username) {
        setText("ttDashGreeting", `Welcome back, ${meRaw.username}`);
      } else {
        setText("ttDashGreeting", "Welcome back");
      }

      const nCand = cands.length;
      setText("ttDashStatCandidates", String(nCand));
      let ongoing = 0;
      let hold = 0;
      let done = 0;
      let missPwd = 0;
      let unband = 0;
      for (const c of cands) {
        const es = (c.enrollment_status || "Ongoing").trim();
        if (es === "On Hold") hold += 1;
        else if (es === "Completed") done += 1;
        else ongoing += 1;
        if (!c.has_app_password) missPwd += 1;
        if (computeDaysForBucklistClient(c) == null) unband += 1;
      }
      setText(
        "ttDashStatCandSub",
        nCand ? `${ongoing} ongoing · ${hold} on hold · ${done} done` : "No candidates yet",
      );
      setText("ttDashEnrollOngoing", String(ongoing));
      setText("ttDashEnrollHold", String(hold));
      setText("ttDashEnrollDone", String(done));
      setText("ttDashMissingPwd", String(missPwd));
      setText("ttDashUnassigned", String(unband));

      const plans = Array.isArray(plansRaw) ? plansRaw : [];
      let nActive = 0;
      let nPaused = 0;
      let nDoneWf = 0;
      for (const p of plans) {
        const st = (p.status || "active").toLowerCase();
        if (st === "paused") nPaused += 1;
        else if (st === "completed" || st === "expired") nDoneWf += 1;
        else nActive += 1;
      }
      setText("ttDashStatWorkflow", String(plans.length));
      setText(
        "ttDashStatWfSub",
        plans.length ? `${nActive} active · ${nPaused} paused · ${nDoneWf} finished` : "No 6-month plans yet",
      );

      const tg = tgRaw && typeof tgRaw === "object" ? tgRaw : { total: 0, invalid: 0 };
      const tTotal = parseInt(tg.total, 10) || 0;
      const tInv = parseInt(tg.invalid, 10) || 0;
      setText("ttDashStatTargets", String(tTotal));
      setText(
        "ttDashStatTgSub",
        tInv > 0 ? `${tInv} flagged for review` : "Companies & contacts on file",
      );

      const pipe = pipeRaw && typeof pipeRaw === "object" ? pipeRaw : { assessments: 0, interviews: 0, offers: 0 };
      const a = parseInt(pipe.assessments, 10) || 0;
      const i = parseInt(pipe.interviews, 10) || 0;
      const o = parseInt(pipe.offers, 10) || 0;
      const pipeSum = a + i + o;
      setText("ttDashStatPipeline", String(pipeSum));
      setText("ttDashStatPipeSub", `${a} assessments · ${i} interviews · ${o} offers`);

      let buck = buckRaw && buckRaw.buckets ? buckRaw : null;
      if (!buck) buck = buildBucklistDataFromCandidates(cands);
      const buckets = buck.buckets || {};
      const unassigned = buck.unassigned || [];
      const counts = TT_DASH_BUCK_ORDER.map((k) => (Array.isArray(buckets[k]) ? buckets[k].length : 0));
      const unassignedLen = unassigned.length;
      const totalBuck = counts.reduce((x, y) => x + y, 0) + unassignedLen;
      if (totalBuck !== nCand) {
        console.warn("Bucklist band total !== candidate count", { totalBuck, nCand });
      }
      setText(
        "ttDashBucklistTotal",
        totalBuck === nCand ? `${nCand} in Bucklist view` : `${nCand} candidates · ${totalBuck} placed in bands`,
      );

      const maxBar = Math.max(1, ...counts, unassignedLen || 0);
      const barsEl = $("ttDashBucklistBars");
      if (barsEl) {
        const rows = TT_DASH_BUCK_ORDER.map((k, idx) => {
          const n = counts[idx];
          const pct = Math.round((n / maxBar) * 100);
          const col = TT_DASH_BUCK_COLORS[idx] || "#94a3b8";
          const lab = TT_DASH_BUCK_LABELS[k] || k;
          return `<div class="tt-dash-bar-row">
        <span class="tt-dash-bar-name">${escapeHtml(lab)}</span>
        <div class="tt-dash-bar-track" aria-hidden="true"><div class="tt-dash-bar-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="tt-dash-bar-count">${n}</span>
      </div>`;
        }).join("");
        const unRows =
          unassignedLen > 0
            ? `<div class="tt-dash-bar-row tt-dash-bar-row--muted">
        <span class="tt-dash-bar-name">Not in a band</span>
        <div class="tt-dash-bar-track"><div class="tt-dash-bar-fill tt-dash-bar-fill--muted" style="width:${Math.round(
              (unassignedLen / maxBar) * 100,
            )}%"></div></div>
        <span class="tt-dash-bar-count">${unassignedLen}</span>
      </div>`
            : "";
        barsEl.innerHTML = rows + unRows;
      }

      const legEl = $("ttDashBucklistLegend");
      if (legEl) {
        legEl.innerHTML = TT_DASH_BUCK_ORDER.map((k, idx) => {
          const n = counts[idx];
          const col = TT_DASH_BUCK_COLORS[idx] || "#94a3b8";
          const lab = TT_DASH_BUCK_LABELS[k] || k;
          return `<div class="col-6">
        <div class="tt-dash-legend-item">
          <span class="tt-dash-legend-swatch" style="background:${col}"></span>
          <span class="tt-dash-legend-label">${escapeHtml(lab)}</span>
          <span class="tt-dash-legend-val">${n}</span>
        </div>
      </div>`;
        }).join("");
      }

      try {
        renderDashWfTracker(wfTrackRaw);
      } catch (wfErr) {
        console.error("renderDashWfTracker:", wfErr);
        const host = $("ttDashWfTracker");
        if (host) {
          host.innerHTML =
            '<p class="text-danger small mb-0">Could not draw the 6-month table. Use Refresh overview or open <strong>6-Month Service</strong>.</p>';
        }
      }
    } catch (err) {
      console.error("refreshOverviewDashboard:", err);
      toast('Overview could not finish loading. Click "Refresh overview" or reload the page.', "danger");
      setText("ttDashStatCandidates", "—");
      setText("ttDashStatCandSub", "Load error — try Refresh overview");
      setText("ttDashStatWorkflow", "—");
      setText("ttDashStatWfSub", "—");
      setText("ttDashStatTargets", "—");
      setText("ttDashStatTgSub", "—");
      setText("ttDashStatPipeline", "—");
      setText("ttDashStatPipeSub", "—");
      setText("ttDashEnrollOngoing", "0");
      setText("ttDashEnrollHold", "0");
      setText("ttDashEnrollDone", "0");
      setText("ttDashMissingPwd", "—");
      setText("ttDashUnassigned", "—");
      setText("ttDashBucklistTotal", "—");
      const barsEl = $("ttDashBucklistBars");
      if (barsEl) barsEl.innerHTML = "";
      const legEl = $("ttDashBucklistLegend");
      if (legEl) legEl.innerHTML = "";
    } finally {
      clearLoadingIfStuck();
      _overviewDashboardPromise = null;
    }
  })();

  return _overviewDashboardPromise;
}

function setActiveTab(tabId) {
  cleanupStuckInteractions();
  console.log("setActiveTab called with:", tabId);
  document.querySelectorAll("#sideTabs .list-group-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tt-tab").forEach(sec => {
    sec.classList.toggle("d-none", sec.id !== tabId);
    if (sec.id === tabId) {
      console.log("Showing section:", sec.id);
    }
  });

  if (tabId === "tab-dashboard") void refreshOverviewDashboard();
  if (tabId === "tab-candidates") {
    void loadWfIndustryCountryDatalists();
    refreshCandidates();
  }
  if (tabId === "tab-results") loadResults();
  if (tabId === "tab-admin") {
    fetchPendingUsers();
    fetchAllUsers();
  }
  if (tabId === "tab-workflow") {
    updateServiceCalculator();
    refreshWorkflowPlans();
  }
  if (tabId === "tab-bucklist") {
    void loadWfIndustryCountryDatalists();
    refreshBucklist();
  }
  if (tabId === "tab-runs") {
    void refreshRuns();
  }
  if (tabId === "tab-role-analysis") {
    refreshRoleAnalysis();
    document.body.classList.add("tt-cinematic"); // Auto-enable cinematic mode for Role Analysis
  } else {
    document.body.classList.remove("tt-cinematic");
  }

  if (tabId === "tab-targets") {
    currentSelectedCountry = null;
    currentSelectedIndustry = null;
    refreshIndustries();
    if ($("industryDetailsSection")) $("industryDetailsSection").classList.add("d-none");
    if ($("industryGridContainer")) $("industryGridContainer").classList.add("d-none");
    if ($("targetGridHeader")) $("targetGridHeader").classList.add("d-none");
    if ($("countryGridContainer")) $("countryGridContainer").classList.remove("d-none");

    // Hide Industry-level tools initially - only show inside a country
    if ($("industryAddBtn")) $("industryAddBtn").classList.add("d-none");
    if ($("targetsClearBtn")) $("targetsClearBtn").classList.add("d-none");

    renderCountryGrid();
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#sideTabs .list-group-item");
  if (btn && btn.dataset.tab) {
    setActiveTab(btn.dataset.tab);
  }
  const go = e.target.closest("[data-tt-goto]");
  if (go) {
    const tid = go.getAttribute("data-tt-goto");
    if (tid) setActiveTab(tid);
  }
});

// Cinematic Toggle Listener (V16.0)
document.addEventListener("click", (e) => {
  if (e.target.closest("#roleToggleSidebarBtn")) {
    document.body.classList.toggle("tt-cinematic");
  }
});

async function apiJson(url, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const defaultHeaders = {};
  if (method !== "GET" && method !== "HEAD") {
    defaultHeaders["Content-Type"] = "application/json";
  }
  const res = await fetchWithRetry(url, {
    headers: { ...defaultHeaders, ...(opts.headers || {}) },
    ...opts
  });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data;
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = { error: "Invalid JSON from server" };
    }
  } else {
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(htmlResponseToApiError(res, text));
      err.status = res.status;
      throw err;
    }
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && data.error
        ? data.error
        : typeof data === "string"
          ? data
          : `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    if (data && typeof data === "object" && data.hint) err.hint = data.hint;
    throw err;
  }
  return data;
}

/** Tries /api/sa/* if /api/smart-automation/* returns 404 (HTML or JSON; old servers often omit JSON 404). */
async function apiJsonSmartAutomation(url, opts = {}) {
  try {
    return await apiJson(url, opts);
  } catch (e) {
    const st = e && e.status;
    const m = ((e && e.message) || "").toLowerCase();
    const is404 =
      st === 404 ||
      m === "not found" ||
      /\b404\b/.test(m) ||
      (m.includes("not found") && !m.includes("candidate"));
    const alt =
      url.includes("/api/smart-automation/") && is404
        ? url.replace("/api/smart-automation/", "/api/sa/")
        : null;
    if (alt && alt !== url) {
      return await apiJson(alt, opts);
    }
    throw e;
  }
}

async function apiForm(url, formData) {
  const res = await fetchWithRetry(url, { method: "POST", body: formData, headers: {} });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data;
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(htmlResponseToApiError(res, text));
      err.status = res.status;
      throw err;
    }
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : `Request failed (${res.status})`);
    const err = new Error(msg);
    err.status = res.status;
    if (data && typeof data === "object" && data.hint) err.hint = data.hint;
    throw err;
  }
  return data;
}

// Network resilience: timeouts + retries (helps when backend restarts or network is flaky)
async function fetchWithRetry(url, opts = {}, retries = 3, timeoutMs = 15000) {
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        ...opts,
        signal: controller.signal,
      });
      clearTimeout(t);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      // Exponential backoff
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr || new Error("Network error");
}

function setBackendBadge(isOk, note = "") {
  const b = $("backendBadge");
  if (!b) return;
  b.textContent = `Backend: ${isOk ? "Online" : "Offline"}${note ? " | " + note : ""}`;
  b.classList.remove("text-bg-success", "text-bg-danger", "text-bg-light");
  b.classList.add(isOk ? "text-bg-success" : "text-bg-danger");
}

async function pingBackend() {
  try {
    const res = await fetchWithRetry("/__health__", { method: "GET", headers: {} }, 1, 5000);
    if (!res.ok) {
      setBackendBadge(false);
      return false;
    }
    const data = await res.json().catch(() => ({}));
    setBackendBadge(true, data.port ? `:${data.port}` : "");
    return true;
  } catch {
    setBackendBadge(false);
    return false;
  }
}

// ----------------- Candidates -----------------
let candidates = [];
let selectedCandidateId = null;
/** IDs of candidates last shown in the table (after filters) — used for scoped PO transfer. */
let lastFilteredCandidateIds = [];

function placementOfficerChoiceValues() {
  const fromDb = candidates.map((c) => (c.placement_officer_member || "").trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const x of [...PLACEMENT_OFFICER_ROSTER, ...fromDb]) {
    const v = (x || "").toString().trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function rmMemberChoiceValues() {
  const fromDb = candidates.map((c) => (c.rm_member || "").trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const x of [...PLACEMENT_OFFICER_ROSTER, ...fromDb]) {
    const v = (x || "").toString().trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function fillPlacementOfficerDatalist() {
  const dl = $("placementOfficerRosterList");
  if (!dl) return;
  dl.innerHTML = "";
  for (const name of PLACEMENT_OFFICER_ROSTER) {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  }
}

function enrollmentStatusBadgeHtml(status) {
  const s = status || "Ongoing";
  let cls = "bg-secondary";
  if (s === "Ongoing") cls = "bg-success";
  else if (s === "On Hold") cls = "bg-warning text-dark";
  else if (s === "Completed") cls = "bg-dark";
  return `<span class="badge ${cls} small">${escapeHtml(s)}</span>`;
}

/** Resume / cover paths from API (project-relative). */
function candidateAssetPathsHtml(c) {
  const rp = (c.resume_path || "").trim();
  const cp = (c.cover_letter_path || "").trim();
  const line = (label, p) =>
    p
      ? `<div class="small text-truncate" style="max-width:min(300px,32vw);" title="${escapeHtml(p)}"><span class="text-muted">${label}</span> ${escapeHtml(p)}</div>`
      : `<div class="small text-muted">${label} —</div>`;
  return `<div class="d-flex flex-column gap-1 lh-sm">${line("Resume:", rp)}${line("Cover:", cp)}</div>`;
}

function renderCandidates(list) {
  const tbody = $("candTbody");
  tbody.innerHTML = "";
  for (const c of list) {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    // Asset badges
    const appPwdIcon = c.has_app_password
      ? '<i class="bi bi-key-fill text-success" title="App Password Set"></i>'
      : '<i class="bi bi-key text-danger" title="MISSING App Password"></i>';

    const resumeIcon = c.has_resume
      ? '<i class="bi bi-file-earmark-pdf-fill text-primary" title="Resume PDF Present"></i>'
      : '<i class="bi bi-file-earmark-pdf text-muted" title="No Resume"></i>';

    const coverIcon = c.has_cover_letter
      ? '<i class="bi bi-file-earmark-text-fill text-info" title="Cover Letter Present"></i>'
      : '<i class="bi bi-file-earmark-text text-muted" title="No Cover Letter"></i>';

    const assetsHtml = `<div class="d-flex flex-wrap align-items-start gap-2">
      <div class="d-flex gap-2 align-items-center flex-shrink-0" style="font-size: 1.1rem;">${appPwdIcon} ${resumeIcon} ${coverIcon}</div>
      ${candidateAssetPathsHtml(c)}
    </div>`;
    const updatedStr = formatDateTime(c.updated_at);

    const profInd = (c.industry_types || "").trim();
    const indCell = profInd
      ? `<span class="small" title="${escapeHtml(profInd)}">${escapeHtml(profInd.length > 48 ? profInd.slice(0, 45) + "…" : profInd)}</span>`
      : `<span class="text-muted small">—</span>`;

    const hrIndStr = (c.smart_industry || "").trim();
    const hrIndCell = hrIndStr
      ? `<span class="badge bg-info bg-opacity-10 text-info-emphasis border border-info border-opacity-25 small fw-semibold">${escapeHtml(hrIndStr.length > 40 ? hrIndStr.slice(0, 37) + "…" : hrIndStr)}</span>`
      : `<span class="text-muted small">—</span>`;

    let ct = stripWorkCountryPrefix((c.smart_country || "").trim() || (c.country_type || "").trim());
    const ctCell = ct
      ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 small fw-semibold">${escapeHtml(ct)}</span>`
      : `<span class="text-muted small">—</span>`;

    const dcomp = c.days_in_system_computed;
    const dsrc = c.days_in_system_source || "";
    let daysCell;
    if (dcomp != null && dcomp !== "" && !Number.isNaN(Number(dcomp))) {
      const est = dsrc === "created_age";
      const tip =
        dsrc === "workflow_plan"
          ? "Live service days from active 6-Month plan (increases daily)"
          : dsrc === "profile_service_start"
            ? "Live days from profile service start date"
            : dsrc === "workspace_service"
              ? "Live days from workspace service start"
              : dsrc === "bucklist_pin"
                ? "Pinned day count (no service-start anchor on file)"
                : "Estimated from record creation date";
      daysCell = `<span class="small fw-semibold" title="${escapeHtml(tip)}">${escapeHtml(String(dcomp))}${
        est
          ? ` <span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25">est</span>`
          : ""
      }</span>`;
    } else {
      daysCell = `<span class="text-muted small">—</span>`;
    }

    const es = c.enrollment_status || "Ongoing";
    const esCell = enrollmentStatusBadgeHtml(es);
    const bdays = computeDaysForBucklistClient(c);
    const bkey = bdays == null ? null : bucketKeyForBucklistDays(bdays);
    const bandCell = bkey
      ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 small fw-semibold">${escapeHtml(bucklistBandDisplayLabel(bkey))}</span>`
      : `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 small">—</span>`;

    tr.innerHTML = `<td><strong>${escapeHtml(c.name)}</strong></td>
                    <td>${escapeHtml(c.email)}</td>
                    <td>${escapeHtml(c.pa_member || "")}</td>
                    <td>${escapeHtml(c.rm_member || "")}</td>
                    <td>${escapeHtml(c.placement_officer_member || "")}</td>
                    <td>${daysCell}</td>
                    <td>${bandCell}</td>
                    <td>${esCell}</td>
                    <td>${ctCell}</td>
                    <td>${hrIndCell}</td>
                    <td>${indCell}</td>
                    <td>${assetsHtml}</td>
                    <td class="small text-muted">${updatedStr}</td>`;

    tr.addEventListener("click", () => loadCandidate(c.id));
    tbody.appendChild(tr);
  }
  $("candsBadge").textContent = `Candidates: ${list.length}`;
  renderCandidatePicklist();
}

function renderCandidatePicklist() {
  const box = $("candPickList");
  if (!box) return;
  box.innerHTML = "";
  for (const c of candidates) {
    const div = document.createElement("div");
    div.className = "form-check run-cand-row py-1 border-bottom border-opacity-10";
    const ctNorm = stripWorkCountryPrefix((c.smart_country || "").trim() || (c.country_type || "").trim());
    div.dataset.filterText = `${(c.name || "").toLowerCase()} ${(c.email || "").toLowerCase()} ${(c.pa_member || "").toLowerCase()} ${(c.rm_member || "").toLowerCase()} ${(c.placement_officer_member || "").toLowerCase()} ${ctNorm.toLowerCase()} ${(c.industry_types || "").toLowerCase()} ${(c.smart_industry || "").toLowerCase()} ${(c.enrollment_status || "ongoing").toLowerCase()}`;
    const indPick = (c.industry_types || "").trim();
    const hrIndPick = (c.smart_industry || "").trim();
    const ctPick = ctNorm;
    const hrIndLbl = hrIndPick
      ? ` <span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 small">${escapeHtml(hrIndPick.length > 18 ? hrIndPick.slice(0, 15) + "…" : hrIndPick)}</span>`
      : "";
    const indLbl = indPick ? ` <span class="text-muted small">${escapeHtml(indPick.length > 32 ? indPick.slice(0, 29) + "…" : indPick)}</span>` : "";
    const ctLbl = ctPick ? ` <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 small">${escapeHtml(ctPick.length > 24 ? ctPick.slice(0, 21) + "…" : ctPick)}</span>` : "";
    div.innerHTML = `<input class="form-check-input" type="checkbox" value="${c.id}" id="pick_${c.id}">
                     <label class="form-check-label" for="pick_${c.id}">${escapeHtml(c.name)} <span class="text-muted small">(${escapeHtml(c.email)})</span>${ctLbl}${hrIndLbl}${indLbl}</label>`;
    box.appendChild(div);
  }
  filterRunCandidatePicklist();
}

function filterRunCandidatePicklist() {
  const q = (($("runCandSearch") && $("runCandSearch").value) || "").trim().toLowerCase();
  const rows = document.querySelectorAll("#candPickList .run-cand-row");
  let n = 0;
  rows.forEach((row) => {
    const hay = (row.dataset.filterText || "");
    const show = !q || hay.includes(q);
    row.classList.toggle("d-none", !show);
    if (show) n += 1;
  });
  const meta = $("runCandPickMeta");
  if (meta) meta.textContent = `${n} shown · ${candidates.length} total`;
}

function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Normalize country label for table/filters (stored value is e.g. India, not "Work India"). */
function stripWorkCountryPrefix(s) {
  const t = (s ?? "").toString().trim();
  if (!t) return "";
  return t.toLowerCase().startsWith("work ") ? t.slice(5).trim() : t;
}

function uniqueValues(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const v = (x || "").toString().trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function populateSelect(sel, values, defaultLabel) {
  if (!sel) return;
  const current = (sel.value || "");
  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = defaultLabel || "All";
  sel.appendChild(o0);
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
  // try to keep existing selection if still present
  if (current) {
    const found = [...sel.options].some(o => (o.value || "").toLowerCase() === current.toLowerCase());
    if (found) sel.value = current;
  }
}

function setProfileVisibility(show) {
  const card = $("candProfileCard");
  const listCol = $("candListCol");
  if (card) card.style.display = show ? "block" : "none";
  if (listCol) {
    if (show) {
      listCol.classList.remove("col-xl-12");
      listCol.classList.add("col-xl-6");
    } else {
      listCol.classList.remove("col-xl-6");
      listCol.classList.add("col-xl-12");
    }
  }
}


function clearCandidateForm() {
  selectedCandidateId = null;
  const ids = [
    "candId", "candName", "candEmail", "candPaMember",
    "candRmMember", "candPlacementOfficer", "candBucklistDays", "candAppPwd", "candSubject",
    "candMessage", "candRoles", "candIndustryTypes", "candEnrollmentId", "candCountryType", "candSmartIndustry",
  ];
  ids.forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  if ($("candEnrollmentStatus")) $("candEnrollmentStatus").value = "Ongoing";
  const resumeBadge = $("resumeBadge");
  if (resumeBadge) resumeBadge.innerHTML = "";
  const coverBadge = $("coverBadge");
  if (coverBadge) coverBadge.innerHTML = "";

  const delBtn = $("candDeleteBtn");
  if (delBtn) delBtn.disabled = true;

  const auditEl = $("candProfileAuditLine");
  if (auditEl) auditEl.innerHTML = "";

  // Clear file inputs
  ["candResume", "candCover"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });

  setProfileVisibility(true);
}

async function refreshCandidates() {
  try {
    candidates = await apiJson("/api/candidates");
  } catch (e) {
    console.error(e);
    const tbody = $("candTbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-danger small">${escapeHtml(shortApiError(e.message))}</td></tr>`;
    }
    return;
  }
  // Populate filter dropdowns
  populateSelect($("candPaFilter"), uniqueValues(candidates.map(c => (c.pa_member || "").trim())), "All PA");
  populateSelect($("candRmFilter"), rmMemberChoiceValues(), "All RM members");
  if ($("candPoFilter")) {
    populateSelect($("candPoFilter"), placementOfficerChoiceValues(), "All placement officers");
  }
  populateSelect(
    $("candIndustryFilter"),
    uniqueValues(
      candidates.flatMap((c) => {
        const rows = [];
        const prof = (c.industry_types || "").trim();
        const hr = (c.smart_industry || "").trim();
        if (prof) rows.push(prof);
        if (hr) rows.push(hr);
        return rows;
      }),
    ),
    "All industries (HR or profile)",
  );
  populateSelect(
    $("candCountryFilter"),
    uniqueValues(
      candidates.map((c) => {
        const cty = stripWorkCountryPrefix(c.country_type);
        if (cty) return cty;
        const sc = stripWorkCountryPrefix(c.smart_country);
        if (sc) return sc;
        return stripWorkCountryPrefix(c.workspace_country);
      }),
    ),
    "All Country Types",
  );
  populateSelect($("poTransferFrom"), placementOfficerChoiceValues(), "From (current)…");
  populateSelect($("poTransferTo"), placementOfficerChoiceValues(), "To (new)…");
  if ($("rmTransferFrom")) populateSelect($("rmTransferFrom"), rmMemberChoiceValues(), "From (current)…");
  if ($("rmTransferTo")) populateSelect($("rmTransferTo"), rmMemberChoiceValues(), "To (new)…");

  const paSel = ($("candPaFilter").value || "").trim().toLowerCase();
  const rmSel = ($("candRmFilter")?.value || "").trim().toLowerCase();
  const poSel = ($("candPoFilter")?.value || "").trim().toLowerCase();
  const bandSel = ($("candBucklistBandFilter")?.value || "").trim();
  const countrySel = ($("candCountryFilter").value || "").trim().toLowerCase();
  const indSel = ($("candIndustryFilter").value || "").trim().toLowerCase();
  const esSel = ($("candEnrollmentFilter")?.value || "").trim();
  const q = ($("candSearch").value || "").trim().toLowerCase();
  const noAppPwd = $("filterNoAppPwd")?.checked || false;

  const filtered = candidates.filter(c => {
    const name = (c.name || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    const pa = (c.pa_member || "").toLowerCase();
    const rm = (c.rm_member || "").toLowerCase();
    const po = (c.placement_officer_member || "").toLowerCase();
    const enr = (c.enrollment_id || "").toLowerCase();
    const ind = (c.industry_types || "").toLowerCase();
    const hrInd = (c.smart_industry || "").toLowerCase();
    let ctLabel = stripWorkCountryPrefix(c.country_type);
    if (!ctLabel) ctLabel = stripWorkCountryPrefix(c.smart_country);
    if (!ctLabel) ctLabel = stripWorkCountryPrefix(c.workspace_country);
    const ct = ctLabel.toLowerCase();
    const scLow = (
      (c.smart_country || "") +
      " " +
      (c.country_type || "") +
      " " +
      (c.workspace_country || "")
    ).toLowerCase();
    const es = (c.enrollment_status || "Ongoing");
    const esLower = es.toLowerCase();
    const matchesText =
      !q ||
      name.includes(q) ||
      email.includes(q) ||
      pa.includes(q) ||
      rm.includes(q) ||
      po.includes(q) ||
      enr.includes(q) ||
      ind.includes(q) ||
      hrInd.includes(q) ||
      ct.includes(q) ||
      scLow.includes(q) ||
      esLower.includes(q);
    const matchesPa = !paSel || pa === paSel;
    const matchesRm = !rmSel || rm === rmSel;
    const matchesPo = !poSel || po === poSel;
    const candDays = computeDaysForBucklistClient(c);
    const candBand = candDays == null ? "__unassigned__" : bucketKeyForBucklistDays(candDays);
    const matchesBand = !bandSel || candBand === bandSel;
    const matchesCountry = !countrySel || ct === countrySel;
    const matchesInd = !indSel || ind === indSel || hrInd === indSel;
    const matchesEs = !esSel || es === esSel;
    const matchesNoAppPwd = !noAppPwd || !c.has_app_password;
    return matchesText && matchesPa && matchesRm && matchesPo && matchesBand && matchesCountry && matchesInd && matchesEs && matchesNoAppPwd;
  });
  lastFilteredCandidateIds = filtered.map((c) => c.id);
  renderCandidates(filtered);
}

async function loadCandidate(id) {
  const c = await apiJson(`/api/candidates/${id}`);
  selectedCandidateId = c.id;
  $("candId").value = c.id;
  $("candName").value = c.name || "";
  $("candEmail").value = c.email || "";
  $("candPaMember").value = c.pa_member || "";
  if ($("candRmMember")) $("candRmMember").value = c.rm_member || "";
  $("candPlacementOfficer").value = c.placement_officer_member || "";
  if ($("candBucklistDays")) {
    const bd = c.bucklist_days_in_system;
    $("candBucklistDays").value = bd != null && bd !== "" ? String(bd) : "";
  }
  const hintEl = $("candBucklistDaysHint");
  if (hintEl) {
    const src = c.days_in_system_source || "";
    if (src === "workflow_plan") {
      hintEl.textContent = `Days in the list (${c.days_in_system_computed}) follow the active 6-Month service plan and update daily. The field below pins a value only when there is no plan/workspace/profile start anchor.`;
    } else if (src === "profile_service_start" || src === "workspace_service") {
      hintEl.textContent = `Live days in system: ${c.days_in_system_computed} (from ${src === "profile_service_start" ? "profile service start" : "workspace service start"}). Clear the pinned field if unused.`;
    } else if (c.days_in_system_computed != null && c.days_in_system_computed !== "") {
      const pinned = c.bucklist_days_in_system != null && c.bucklist_days_in_system !== "";
      hintEl.textContent = pinned
        ? "Pinned value sets Bucklist when no service-start date exists. Clear and save to use record-age estimate."
        : `No pin — ${src === "created_age" ? "estimated from record age" : "computed"}: ${c.days_in_system_computed}. Enter a number to pin.`;
    } else {
      hintEl.textContent = "Sets Bucklist day buckets when no service start is on file. Clear to use the automatic estimate.";
    }
  }
  $("candAppPwd").value = c.app_password || "";
  $("candSubject").value = c.subject_template || "";
  $("candMessage").value = c.message_template || "";
  $("candRoles").value = c.roles_text || "";
  if ($("candIndustryTypes")) $("candIndustryTypes").value = c.industry_types || "";
  if ($("candCountryType")) $("candCountryType").value = c.smart_country || "";
  if ($("candSmartIndustry")) $("candSmartIndustry").value = (c.smart_industry || "").trim();
  const auditEl = $("candProfileAuditLine");
  if (auditEl) {
    const u = (c.updated_at || "").trim();
    auditEl.innerHTML = u
      ? `<i class="bi bi-clock-history me-1"></i><span class="text-nowrap">Record last saved</span><br><span class="fw-medium text-body-secondary">${escapeHtml(formatDateTime(u))}</span>`
      : `<span class="text-muted">Save the profile to record a timestamp for auditing.</span>`;
  }
  $("candEnrollmentId").value = c.enrollment_id || "";
  if ($("candEnrollmentStatus")) {
    const es = c.enrollment_status || "Ongoing";
    $("candEnrollmentStatus").value = ["Ongoing", "On Hold", "Completed"].includes(es) ? es : "Ongoing";
  }
  $("resumeBadge").innerHTML = c.resume_on_file ? `<span class="badge text-bg-success tt-pill">Resume uploaded</span>` : `<span class="badge text-bg-danger tt-pill">No resume</span>`;
  $("coverBadge").innerHTML = c.cover_on_file ? `<span class="badge text-bg-success tt-pill">Cover uploaded</span>` : `<span class="badge text-bg-danger tt-pill">No cover</span>`;
  const delBtn = $("candDeleteBtn");
  if (delBtn) {
    delBtn.disabled = false;
  }
  const syncBtn = $("syncJobAppsBtn");
  if (syncBtn) {
    syncBtn.onclick = () => syncCandidate(selectedCandidateId);
  }
  setProfileVisibility(true);
  loadJobApplications(id);
  loadCandidateEmailEvents(id);
}

async function syncCandidate(candidateId) {
  if (!candidateId) return;
  const btn = $("candSyncBtn");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Syncing...`;
  btn.disabled = true;

  try {
    const res = await apiJson(`/api/candidates/${candidateId}/sync-apps`, { method: "POST" });
    toast(res.message || "Sync completed successfully!", "success");
    // Refresh views
    loadCandidateEmailEvents(candidateId);
    loadJobApplications(candidateId);
    loadResults();
  } catch (err) {
    toast(`Sync failed: ${err.message}`, "danger");
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

async function loadCandidateEmailEvents(candidateId) {
  const container = $("candEmailEventsSection");
  const tbody = $("candEmailEventsTbody");
  const badge = $("emailEventsCountBadge");
  if (!container || !tbody) return;

  try {
    const events = await apiJson(`/api/candidates/${candidateId}/email-events`);
    tbody.innerHTML = "";
    badge.textContent = `${events.length} Events`;

    if (events.length > 0) {
      container.style.display = "block";
      events.forEach(ev => {
        const tr = document.createElement("tr");
        let typeBadge = `<span class="badge text-bg-secondary">${escapeHtml(ev.event_type)}</span>`;
        if (ev.event_type === "Assessment") typeBadge = `<span class="badge text-bg-primary">Assessment</span>`;
        if (ev.event_type === "Interview") typeBadge = `<span class="badge text-bg-warning">Interview</span>`;
        if (ev.event_type === "Offer") typeBadge = `<span class="badge text-bg-success">Offer</span>`;

        const dateStr = ev.received_at ? formatDateTime(ev.received_at) : formatDateTime(ev.created_at);

        tr.innerHTML = `
          <td class="text-muted" style="width: 140px;">${dateStr}</td>
          <td class="fw-bold">${escapeHtml(ev.company_name)}</td>
          <td class="small">${escapeHtml(ev.job_role)}</td>
          <td>${typeBadge}</td>
          <td class="small" title="${escapeHtml(ev.subject)}">${escapeHtml(ev.subject)}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to load email events:", err);
    container.style.display = "none";
  }
}

async function loadJobApplications(candidateId) {
  const container = $("candJobAppsSection");
  const tbody = $("candJobAppsTbody");
  const badge = $("jobAppsCountBadge");
  if (!container || !tbody) return;

  try {
    const apps = await apiJson(`/api/candidates/${candidateId}/job-applications`);
    tbody.innerHTML = "";
    badge.textContent = `${apps.length} Applications`;

    if (apps.length > 0) {
      container.style.display = "block";
      apps.forEach(app => {
        const tr = document.createElement("tr");
        let statusBadge = `<span class="badge text-bg-secondary">${escapeHtml(app.status || "Applied")}</span>`;
        if (app.status === "Interview") statusBadge = `<span class="badge text-bg-warning">Interview</span>`;
        if (app.status === "Shortlisted") statusBadge = `<span class="badge text-bg-info">Shortlisted</span>`;
        if (app.status === "Rejected") statusBadge = `<span class="badge text-bg-danger">Rejected</span>`;
        if (app.status === "Offer") statusBadge = `<span class="badge text-bg-success">Offer</span>`;

        tr.innerHTML = `
          <td>${formatDateTime(app.created_at)}</td>
          <td><strong>${escapeHtml(app.company_name)}</strong></td>
          <td>${escapeHtml(app.job_role)}</td>
          <td>${escapeHtml(app.country)}</td>
          <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to load job apps:", err);
    container.style.display = "none";
  }
}
let allResultsData = [];

async function loadResults() {
  console.log("loadResults started");
  // Clear any browser-autofilled value in the search box
  const searchInput = $("resSearchInput");
  if (searchInput) searchInput.value = "";
  try {
    // Only load email milestones: Assessment, Interview, Offer
    const milestones = await apiJson("/api/results/milestones");
    allResultsData = milestones;

    // Populate Placement Officer filter dropdown
    const poSelect = $("resPoFilter");
    if (poSelect) {
      const poSet = new Set();
      milestones.forEach(ev => {
        const po = (ev.placement_officer || "").trim();
        if (po) poSet.add(po);
      });
      const sorted = [...poSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      poSelect.innerHTML = '<option value="all">All Placement Officers</option>' +
        sorted.map(po => `<option value="${escapeHtml(po)}">${escapeHtml(po)}</option>`).join("");
    }

    const stats = await apiJson("/api/results/stats");
    updateResultsStats(stats);

    filterResults();
  } catch (err) {
    console.error("Error in loadResults:", err);
  }
}

function updateResultsStats(stats) {
  if ($("statAssessments")) $("statAssessments").textContent = stats.assessments || 0;
  if ($("statInterviews")) $("statInterviews").textContent = stats.interviews || 0;
  if ($("statOffers")) $("statOffers").textContent = stats.offers || 0;
}

function filterResults() {
  const query = ($("resSearchInput")?.value || "").toLowerCase();
  const eventType = $("resStatusFilter")?.value || "all";
  const poFilter = $("resPoFilter")?.value || "all";
  const hideUnknown = $("resHideUnknownSwitch")?.checked || false;

  const filtered = allResultsData.filter(ev => {
    const matchesSearch = !query || (
      (ev.candidate_name || "").toLowerCase().includes(query) ||
      (ev.company_name || "").toLowerCase().includes(query) ||
      (ev.job_role || "").toLowerCase().includes(query) ||
      (ev.subject || "").toLowerCase().includes(query) ||
      (ev.placement_officer || "").toLowerCase().includes(query)
    );
    const matchesType = (eventType === "all" || ev.event_type === eventType);
    const matchesPo = (poFilter === "all" || (ev.placement_officer || "") === poFilter);
    const matchesUnknown = !hideUnknown || !(ev.candidate_name || "Unknown").toLowerCase().includes("unknown");
    return matchesSearch && matchesType && matchesPo && matchesUnknown;
  });

  renderResultsTable(filtered);
}

/** Admin Panel Logic **/
function filterSaCandList() {
  const q = (($("saCandSearch") && $("saCandSearch").value) || "").trim().toLowerCase();
  document.querySelectorAll("#saCandList .sa-cand-row").forEach((row) => {
    const t = row.dataset.filterText || "";
    row.classList.toggle("d-none", !!(q && !t.includes(q)));
  });
}

async function fetchAllUsers() {
  const tbody = document.getElementById("adminAllUsersTbody");
  if (!tbody) return;
  try {
    const [usersRes, meRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/auth/me")]);
    const users = await usersRes.json();
    const me = meRes.ok ? await meRes.json() : {};
    const myId = me.user_id != null ? Number(me.user_id) : null;
    const adminTotal = users.filter((u) => String(u.role || "").toLowerCase() === "admin").length;

    if (users.error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${escapeHtml(users.error)}</td></tr>`;
      return;
    }
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No users yet.</td></tr>';
      return;
    }
    tbody.innerHTML = users
      .map((u) => {
        const uid = Number(u.id);
        const isSelf = myId != null && !Number.isNaN(myId) && uid === myId;
        const isOnlyAdmin =
          String(u.role || "").toLowerCase() === "admin" && adminTotal <= 1;
        
        // Actions
        const removeBtn = (!isSelf && !isOnlyAdmin)
          ? `<button type="button" class="btn btn-outline-danger btn-sm" onclick="removeAdminUser(${uid})" title="Permanently delete this account"><i class="bi bi-person-x"></i></button>`
          : ``;
          
        let roleOptions = "";
        ["user", "manager", "admin"].forEach(r => {
          roleOptions += `<option value="${r}" ${u.role === r ? "selected" : ""}>${r.toUpperCase()}</option>`;
        });
        const roleDropdown = (isSelf || me.role !== "admin") 
            ? `<span class="badge bg-secondary">${escapeHtml(u.role || "user")}</span>` 
            : `<select class="form-select form-select-sm" onchange="changeUserRole(${uid}, this.value)">${roleOptions}</select>`;

        return `
      <tr>
        <td class="fw-semibold">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleDropdown}</td>
        <td>
           <button class="btn btn-sm btn-outline-secondary" onclick="editUserFeatures(${uid}, '${escapeHtml(u.username)}')" ${me.role !== 'admin' ? 'disabled' : ''}>Configure Tabs</button>
        </td>
        <td class="text-end">${removeBtn}</td>
      </tr>`;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading users.</td></tr>';
  }
}

async function changeUserRole(userId, newRole) {
  if (!confirm(`Change user role to ${newRole}?`)) {
    fetchAllUsers(); // reset dropdown
    return;
  }
  try {
    const res = await apiJson(`/api/admin/set-role/${userId}`, { method: 'POST', body: JSON.stringify({ role: newRole }) });
    toast(res.message || res.error, res.error ? "danger" : "success");
    fetchAllUsers();
  } catch (err) {
    toast('Error changing role: ' + err.message, "danger");
  }
}

async function editUserFeatures(userId, username) {
  // In a full implementation, you would open a modal with checkboxes for each tab
  // For this fix, we'll use a prompt to accept comma-separated tab IDs
  const currentFeatures = prompt(
      `Configure visible sidebar tab IDs for ${username} (admin only).\n\nEnter comma-separated tab IDs (e.g. "tab-overview, tab-candidates").\nLeave empty to allow ALL tabs.`,
      "" // optionally fetch current from API and prepopulate
  );
  if (currentFeatures === null) return; // user cancelled
  
  let featuresArray = null;
  if (currentFeatures.trim()) {
      featuresArray = currentFeatures.split(',').map(s => s.trim()).filter(s => s);
  }
  
  try {
    const res = await apiJson(`/api/admin/set-features/${userId}`, { 
        method: 'POST', 
        body: JSON.stringify({ features: featuresArray }) 
    });
    toast(res.message || res.error, res.error ? "danger" : "success");
  } catch (err) {
    toast('Error setting features: ' + err.message, "danger");
  }
}

async function fetchPendingChanges() {
  const tbody = document.getElementById('adminChangesTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/pending-changes');
    const changes = await res.json();

    if (changes.error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${changes.error}</td></tr>`;
      return;
    }

    if (changes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No pending changes.</td></tr>`;
      return;
    }

    tbody.innerHTML = changes.map(c => {
       const summary = Object.keys(c.change_data).join(", ");
       return `
            <tr>
                <td class="small">${formatDateTime(c.created_at)}</td>
                <td class="fw-semibold">${escapeHtml(c.submitted_by)}</td>
                <td>${escapeHtml(c.candidate_name)}</td>
                <td class="small"><span title="${escapeHtml(JSON.stringify(c.change_data))}">${escapeHtml(summary)}</span></td>
                <td class="text-end">
                    <button class="btn btn-success btn-sm me-1" onclick="approveChange(${c.id})">
                        <i class="bi bi-check-lg"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="rejectChange(${c.id})">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">Error loading changes.</td></tr>`;
  }
}

async function approveChange(changeId) {
  if (!confirm('Approve this data change?')) return;
  try {
    const res = await fetch(`/api/admin/approve-change/${changeId}`, { method: 'POST' });
    const data = await res.json();
    toast(data.message || data.error, data.error ? "danger" : "success");
    fetchPendingChanges();
  } catch (err) {
    toast('Error approving change', "danger");
  }
}

async function rejectChange(changeId) {
  const note = prompt('Reject this data change? Optional refusal reason:');
  if (note === null) return;
  try {
    const res = await fetch(`/api/admin/reject-change/${changeId}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }) 
    });
    const data = await res.json();
    toast(data.message || data.error, data.error ? "danger" : "success");
    fetchPendingChanges();
  } catch (err) {
    toast('Error rejecting change', "danger");
  }
}

async function fetchPendingUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/pending-users');
    const users = await res.json();

    if (users.error) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-danger">${users.error}</td></tr>`;
      return;
    }

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No pending user registrations.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
            <tr>
                <td>${formatDateTime(u.created_at)}</td>
                <td class="fw-semibold">${u.username}</td>
                <td>${u.email}</td>
                <td class="text-end">
                    <button class="btn btn-success btn-sm me-1" onclick="approveUser(${u.id})">
                        <i class="bi bi-check-lg"></i> Approve
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="rejectUser(${u.id})">
                        <i class="bi bi-x-lg"></i> Reject
                    </button>
                </td>
            </tr>
        `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-danger">Error loading users.</td></tr>`;
  }
}

async function approveUser(userId) {
  if (!confirm('Approve this user?')) return;
  try {
    const res = await fetch(`/api/admin/approve-user/${userId}`, { method: 'POST' });
    const data = await res.json();
    toast(data.message || data.error, data.error ? "danger" : "success");
    fetchPendingUsers();
    fetchAllUsers();
  } catch (err) {
    toast('Error approving user', "danger");
  }
}

async function rejectUser(userId) {
  if (!confirm('Reject and delete this user registration?')) return;
  try {
    const res = await fetch(`/api/admin/reject-user/${userId}`, { method: 'POST' });
    const data = await res.json();
    toast(data.message || data.error, data.error ? "danger" : "success");
    fetchPendingUsers();
    fetchAllUsers();
  } catch (err) {
    toast('Error rejecting user', "danger");
  }
}

async function removeAdminUser(userId) {
  if (!confirm("Permanently remove this user? They will not be able to sign in again.")) return;
  try {
    const res = await fetch(`/api/admin/remove-user/${userId}`, { method: "POST", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || `Remove failed (${res.status})`, "danger");
      return;
    }
    toast(data.message || "User removed.", "success");
    fetchPendingUsers();
    fetchAllUsers();
  } catch (err) {
    toast("Error removing user", "danger");
  }
}

window.removeAdminUser = removeAdminUser;

function renderResultsTable(events) {
  const tbody = $("resultsTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const badge = $("resultsCountBadge");
  if (badge) badge.textContent = events.length;

  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">No matching results found.</td></tr>';
    return;
  }

  events.forEach(ev => {
    const tr = document.createElement("tr");
    let typeBadge = `<span class="badge text-bg-secondary">${escapeHtml(ev.event_type)}</span>`;
    if (ev.event_type === "Assessment") typeBadge = `<span class="badge text-bg-primary">Assessment</span>`;
    if (ev.event_type === "Interview") typeBadge = `<span class="badge text-bg-warning">Interview</span>`;
    if (ev.event_type === "Offer") typeBadge = `<span class="badge text-bg-success">Offer</span>`;

    const dateStr = formatDateTime(ev.received_at || ev.created_at);
    const subjectDisplay = ev.subject ? (ev.subject.length > 70 ? ev.subject.substring(0, 67) + "..." : ev.subject) : "-";

    tr.innerHTML = `
      <td class="small text-muted">${dateStr}</td>
      <td><strong>${escapeHtml(ev.candidate_name || "Unknown")}</strong></td>
      <td class="small fw-semibold text-primary">${escapeHtml(ev.placement_officer || "-")}</td>
      <td>${escapeHtml(ev.company_name || "-")}</td>
      <td class="small">${escapeHtml(ev.job_role || "-")}</td>
      <td>${typeBadge}</td>
      <td class="small" title="${escapeHtml(ev.subject || "")}">${escapeHtml(subjectDisplay)}</td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm border-0" onclick="deleteSingleResult(${ev.id})" title="Delete milestone">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteSingleResult(id) {
  if (!confirm("Delete this email event?")) return;
  try {
    await apiJson(`/api/email-events/${id}`, { method: "DELETE" });
    toast("Event deleted", "success");
    await loadResults();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

// Event Listeners for Candidates tab
$("candPaFilter")?.addEventListener("change", refreshCandidates);
$("candRmFilter")?.addEventListener("change", refreshCandidates);
if ($("candPoFilter")) $("candPoFilter").addEventListener("change", refreshCandidates);
$("candBucklistBandFilter")?.addEventListener("change", refreshCandidates);
if ($("candIndustryFilter")) $("candIndustryFilter").addEventListener("change", refreshCandidates);
if ($("candCountryFilter")) $("candCountryFilter").addEventListener("change", refreshCandidates);
if ($("candEnrollmentFilter")) $("candEnrollmentFilter").addEventListener("change", refreshCandidates);
$("candSearch")?.addEventListener("input", refreshCandidates);
if ($("filterNoAppPwd")) $("filterNoAppPwd").addEventListener("change", refreshCandidates);
$("candRefreshBtn")?.addEventListener("click", () => refreshCandidates());


$("runCandSearch")?.addEventListener("input", filterRunCandidatePicklist);
$("runCandSelectVisible")?.addEventListener("click", () => {
  document.querySelectorAll("#candPickList .run-cand-row:not(.d-none) input[type=checkbox]").forEach((cb) => {
    cb.checked = true;
  });
});
$("runCandClearAll")?.addEventListener("click", () => {
  document.querySelectorAll("#candPickList input[type=checkbox]").forEach((cb) => {
    cb.checked = false;
  });
});

$("candSaveBtn")?.addEventListener("click", async () => {
  try {
    const id = $("candId").value.trim();
    const bdEl = $("candBucklistDays");
    let buckPatch = null;
    if (bdEl) {
      const vn = bdEl.valueAsNumber;
      if (!Number.isNaN(vn) && vn >= 0) {
        buckPatch = Math.floor(vn);
      } else {
        const s = String(bdEl.value ?? "").trim();
        if (s !== "") {
          const n = parseInt(s, 10);
          if (!Number.isNaN(n) && n >= 0) buckPatch = n;
        }
      }
    }
    const ctEl = $("candCountryType");
    const countryVal = ctEl ? String(ctEl.value ?? "").trim() : "";
    const hrIndEl = $("candSmartIndustry");
    const hrIndustryVal = hrIndEl ? String(hrIndEl.value ?? "").trim() : "";
    const profilePayload = {
      smart_country: countryVal,
      smart_industry: hrIndustryVal,
      bucklist_days_in_system: buckPatch,
    };
    const existingId = id ? parseInt(id, 10) : NaN;

    /** @returns {Promise<boolean>} true if JSON endpoint saved; false if 404 (use multipart fallback). */
    async function postProfileFields(cid, payload) {
      const r = await fetch(`/api/candidates/${cid}/profile-fields`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      if (r.status === 404) {
        return false;
      }
      if (!r.ok) {
        throw new Error(`Country / days could not be saved (HTTP ${r.status}). ${text.slice(0, 400)}`);
      }
      return true;
    }

    if (!Number.isNaN(existingId)) {
      await postProfileFields(existingId, profilePayload);
    }

    const fd = new FormData();
    if (id) fd.append("id", id);
    fd.append("name", $("candName").value.trim());
    fd.append("email", $("candEmail").value.trim());
    fd.append("pa_member", $("candPaMember").value.trim());
    fd.append("rm_member", ($("candRmMember") && $("candRmMember").value.trim()) || "");
    fd.append("placement_officer_member", $("candPlacementOfficer").value.trim());
    fd.append("app_password", $("candAppPwd").value.trim());
    fd.append("subject_template", $("candSubject").value);
    fd.append("message_template", $("candMessage").value);
    fd.append("roles_text", $("candRoles").value);
    const indEl = document.getElementById("candIndustryTypes");
    fd.append("industry_types", indEl ? String(indEl.value || "").trim() : "");
    fd.append("enrollment_id", $("candEnrollmentId").value.trim());
    fd.append("enrollment_status", $("candEnrollmentStatus") ? String($("candEnrollmentStatus").value || "Ongoing") : "Ongoing");
    fd.append("smart_country", countryVal);
    fd.append("country_type", countryVal);
    fd.append("smart_industry", hrIndustryVal);
    fd.append("bucklist_days_in_system", buckPatch != null ? String(buckPatch) : "");

    if ($("candResume").files[0]) fd.append("resume", $("candResume").files[0]);
    if ($("candCover").files[0]) fd.append("coverLetter", $("candCover").files[0]);

    const res = await apiForm("/api/candidates", fd);
    const savedId = res?.candidate?.id ?? (!Number.isNaN(existingId) ? existingId : null);

    if (!id && savedId) {
      await postProfileFields(savedId, profilePayload);
    }

    await refreshCandidates();
    await refreshBucklist();

    const newEnrollment = $("candEnrollmentStatus") ? String($("candEnrollmentStatus").value || "Ongoing") : "Ongoing";
    if (savedId) {
      await syncWorkflowAutomationWithEnrollment(savedId, newEnrollment);
      await loadCandidate(savedId);
    } else {
      clearCandidateForm();
    }
    alert("Candidate saved.");
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

$("candDeleteBtn")?.addEventListener("click", async () => {
  const id = $("candId").value.trim();
  if (!id) return;
  if (!confirm("Delete this candidate?")) return;
  try {
    await fetch(`/api/candidates/${id}`, { method: "DELETE" });
    clearCandidateForm();
    setProfileVisibility(false);
    await refreshCandidates();
  } catch (err) {
    alert("Delete failed");
  }
});

$("syncJobAppsBtn")?.addEventListener("click", async () => {
  if (!selectedCandidateId) return;
  const btn = $("syncJobAppsBtn");
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Syncing...';

  try {
    const res = await apiJson(`/api/candidates/${selectedCandidateId}/sync-apps`, { method: "POST" });
    toast(res.message, "success");
    await loadJobApplications(selectedCandidateId);
  } catch (err) {
    alert("Sync failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
});

async function syncAllStatus() {
  if (!confirm("This will scan ALL candidates' inboxes for job status updates in the background. Continue?")) return;
  const btn = $("resSyncAllBtn");
  const oldHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Syncing...';
  }

  try {
    const res = await apiJson("/api/candidates/sync-all", { method: "POST" });
    toast(res.message, "success");
    pollSyncStatus();
  } catch (err) {
    alert("Bulk sync failed: " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

let syncPollingInterval = null;
async function pollSyncStatus() {
  if (syncPollingInterval) return;

  const btn = $("resSyncAllBtn");
  const oldHtml = btn ? btn.innerHTML : '<i class="bi bi-arrow-repeat"></i> Sync All Statuses';

  syncPollingInterval = setInterval(async () => {
    try {
      const status = await apiJson("/api/candidates/sync-status");
      if (btn && status.running) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Syncing...';
      }

      if (!status.running) {
        clearInterval(syncPollingInterval);
        syncPollingInterval = null;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = oldHtml;
        }
        if (status.message) toast(status.message, "success");
        await loadResults();
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
  }, 3000);
}

// ----------------- Candidates Buttons -----------------
if ($("poTransferBtn")) {
  $("poTransferBtn").addEventListener("click", async () => {
    const from_po = ($("poTransferFrom") && $("poTransferFrom").value || "").trim();
    const to_po = ($("poTransferTo") && $("poTransferTo").value || "").trim();
    if (!from_po || !to_po) {
      toast("Choose both From and To placement officers.", "warning");
      return;
    }
    if (from_po.toLowerCase() === to_po.toLowerCase()) {
      toast("From and To must be different.", "warning");
      return;
    }
    const scopeFiltered = $("candBulkTransferScopeFiltered") && $("candBulkTransferScopeFiltered").checked;
    if (scopeFiltered && (!lastFilteredCandidateIds || !lastFilteredCandidateIds.length)) {
      toast("No candidates match the current filters — adjust filters or uncheck “visible only”.", "warning");
      return;
    }
    const confirmMsg = scopeFiltered
      ? `Reassign Placement Officer from “${from_po}” to “${to_po}” for up to ${lastFilteredCandidateIds.length} visible row(s) (only rows where PO matches “from” will change)?`
      : `Reassign ALL candidates whose Placement Officer is “${from_po}” (case-insensitive) to “${to_po}”?`;
    if (!confirm(confirmMsg)) return;
    const body = { from_po, to_po };
    if (scopeFiltered) body.candidate_ids = lastFilteredCandidateIds;
    try {
      const res = await apiJson("/api/candidates/transfer-placement-officer", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast(res.message || "Transfer complete.", "success");
      await refreshCandidates();
    } catch (e) {
      toast(e.message || "Transfer failed", "danger");
    }
  });
}

if ($("rmTransferBtn")) {
  $("rmTransferBtn").addEventListener("click", async () => {
    const from_rm = ($("rmTransferFrom") && $("rmTransferFrom").value || "").trim();
    const to_rm = ($("rmTransferTo") && $("rmTransferTo").value || "").trim();
    if (!from_rm || !to_rm) {
      toast("Choose both From and To RM members.", "warning");
      return;
    }
    if (from_rm.toLowerCase() === to_rm.toLowerCase()) {
      toast("From and To must be different.", "warning");
      return;
    }
    const scopeFiltered = $("candBulkTransferScopeFiltered") && $("candBulkTransferScopeFiltered").checked;
    if (scopeFiltered && (!lastFilteredCandidateIds || !lastFilteredCandidateIds.length)) {
      toast("No candidates match the current filters — adjust filters or uncheck “visible only”.", "warning");
      return;
    }
    const confirmMsg = scopeFiltered
      ? `Reassign RM member from “${from_rm}” to “${to_rm}” for up to ${lastFilteredCandidateIds.length} visible row(s) (only rows where RM matches “from” will change)?`
      : `Reassign ALL candidates whose RM member is “${from_rm}” (case-insensitive) to “${to_rm}”?`;
    if (!confirm(confirmMsg)) return;
    const body = { from_rm, to_rm };
    if (scopeFiltered) body.candidate_ids = lastFilteredCandidateIds;
    try {
      const res = await apiJson("/api/candidates/transfer-rm-member", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast(res.message || "Transfer complete.", "success");
      await refreshCandidates();
    } catch (e) {
      toast(e.message || "Transfer failed", "danger");
    }
  });
}

$("candClearAllBtn").addEventListener("click", async () => {
  if (!confirm("Delete ALL candidates? This removes workspaces, job apps, and email events tied to them. Targets (HR list) are kept. This cannot be undone.")) return;
  try {
    await apiJson("/api/candidates/clear", { method: "POST" });
    await refreshCandidates();
    await refreshBucklist();
    clearCandidateForm();
    toast("All candidates deleted.", "success");
  } catch (err) {
    alert("Clear failed: " + err.message);
  }
});

$("candImportXlsx").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("excel", f);
  try {
    await apiForm("/api/candidates/import", fd);
    alert("Candidates imported.");
    await refreshCandidates();
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    e.target.value = "";
  }
});


// Download full candidates backup (Excel + PDFs)
const candBackupBtn = $("candBackupBtn");
if (candBackupBtn) {
  candBackupBtn.addEventListener("click", () => {
    const ok = confirm("Download full Candidates backup? (Includes Gmail App Passwords - keep it secure.)");
    if (!ok) return;
    window.location.href = "/api/candidates/backup_zip";
  });
}




// Restore candidates backup (ZIP)
const candRestoreBtn = $("candRestoreBtn");
const candRestoreModalEl = $("candRestoreModal");
let candRestoreModal = null;
if (candRestoreModalEl && window.bootstrap && bootstrap.Modal) {
  candRestoreModal = new bootstrap.Modal(candRestoreModalEl);
}

if (candRestoreBtn) {
  candRestoreBtn.addEventListener("click", () => {
    if ($("candRestoreZip")) $("candRestoreZip").value = "";
    if ($("candRestoreReplace")) $("candRestoreReplace").checked = false;
    if (candRestoreModal) {
      candRestoreModal.show();
    } else {
      // fallback
      $("candRestoreZip").click();
    }
  });
}

const candRestoreDoBtn = $("candRestoreDoBtn");
if (candRestoreDoBtn) {
  candRestoreDoBtn.addEventListener("click", async () => {
    const fileInput = $("candRestoreZip");
    const f = fileInput ? fileInput.files[0] : null;
    if (!f) {
      alert("Please choose a backup ZIP first.");
      return;
    }
    const replace = $("candRestoreReplace")?.checked;
    const ok = confirm(replace
      ? "This will DELETE existing candidates then restore from the ZIP. Continue?"
      : "Restore candidates from this ZIP (merge/update existing)?");
    if (!ok) return;

    const fd = new FormData();
    fd.append("backup_zip", f);
    fd.append("mode", replace ? "replace" : "merge");

    candRestoreDoBtn.disabled = true;
    candRestoreDoBtn.textContent = "Restoring...";

    try {
      const resp = await apiForm("/api/candidates/restore_backup_zip", fd);
      alert(`Restore completed. Created: ${resp.created}, Updated: ${resp.updated}, Files restored: ${resp.files_restored}`);
      await refreshCandidates();
      if (candRestoreModal) candRestoreModal.hide();
    } catch (err) {
      alert("Restore failed: " + err.message);
    } finally {
      candRestoreDoBtn.disabled = false;
      candRestoreDoBtn.innerHTML = '<i class="bi bi-upload"></i> Restore Now';
      if (fileInput) fileInput.value = "";
    }
  });
}


async function addIndustry() {
  let country = currentSelectedCountry;
  if (!country) {
    country = prompt("Which Country does this Industry category belong to?\n(e.g. Canada, Germany, India, UAE, or Global)", "Global");
  }
  if (country === null) return;
  const name = prompt(`Enter new Industry Type name for ${country}:`);
  if (!name || !name.trim()) return;
  try {
    await apiJson("/api/targets/industries", { method: "POST", body: JSON.stringify({ name: name.trim(), country: country.trim() }) });
    alert("Industry type created. You can now upload data inside it.");
    await refreshTargets(); // Get latest counts
    await refreshIndustries();
    showIndustryDetails(name.trim()); // Auto-navigate to the new industry for upload
  } catch (err) {
    alert("Error: " + err.message);
  }
}
$("industryAddBtn")?.addEventListener("click", addIndustry);

function renderTargets(list) {
  const tbody = $("targetsTbody");
  tbody.innerHTML = "";
  for (const t of list) {
    const tr = document.createElement("tr");
    const valid = t.is_valid ? `<span class="badge text-bg-success tt-pill">Yes</span>` : `<span class="badge text-bg-danger tt-pill">No</span><div class="small text-danger">${escapeHtml(t.invalid_reason || "")}</div>`;
    tr.innerHTML = `
      <td><strong>${escapeHtml(t.company_name)}</strong></td>
      <td>${escapeHtml(t.target_role || "")}</td>
      <td>${escapeHtml(t.hr_email)}</td>
      <td>${escapeHtml(t.country || "")}</td>
      <td>${escapeHtml(t.hr_name || "")}</td>
      <td><span class="badge text-bg-info tt-pill">${escapeHtml(t.industry || "Default")}</span></td>
      <td>${valid}</td>
      <td class="text-end">
        <button class="btn btn-outline-light btn-sm" data-act="edit" data-id="${t.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger btn-sm" data-act="del" data-id="${t.id}"><i class="bi bi-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  $("targetsBadge").textContent = `Targets: ${list.length}`;
}

async function refreshIndustries() {
  industriesList = await apiJson("/api/targets/industries"); // Now returns [{name: x, countries: []}]
  renderIndustryGrid(industriesList);

  const runInd = $("runIndustry");
  if (runInd) {
    const oldVal = runInd.value;
    const names = industriesList.map(i => i?.name || "Default").sort();
    populateSelect(runInd, names, "All Industries (Default)");
    if (names.includes(oldVal)) runInd.value = oldVal;
  }
  void loadWfIndustryCountryDatalists();
}

function renderIndustryGrid(list) {
  const grid = $("industryGridContainer");
  if (!grid) return;
  grid.innerHTML = "";

  // Add "All Industries" card
  const tArr = Array.isArray(targets) ? targets : [];
  const currentC = (currentSelectedCountry || "").toLowerCase();
  const allCount = tArr.filter(t => {
    const tC = (t.country || "").toLowerCase();
    if (currentC === "global" || !currentC) return true;
    if (currentC === "other") return !COUNTRIES.some(c => tC === c.toLowerCase());
    return tC === currentC;
  }).length;

  const allCard = createIndustryCard("All Industries", allCount, "bi-building-fill");
  allCard.onclick = () => showIndustryDetails(null);
  grid.appendChild(allCard);

  if (!Array.isArray(list)) return;

  list.forEach(indObj => {
    const indName = indObj?.name || "Default";
    const countries = indObj?.countries || [];

    // Filter matching country context
    let industryMatchesContext = false;
    if (currentC === "global" || !currentC) {
      industryMatchesContext = true;
    } else {
      industryMatchesContext = countries.some(c => (c || "").toLowerCase() === currentC) ||
        countries.some(c => (c || "").toLowerCase() === "global");
    }

    if (industryMatchesContext) {
      const count = tArr.filter(t => {
        const tInd = (t.industry || "Default").toLowerCase();
        const tC = (t.country || "Global").toLowerCase();
        const matchInd = tInd === indName.toLowerCase();

        let matchCountry = true;
        if (currentC === "global" || !currentC) matchCountry = true;
        else if (currentC === "other") matchCountry = !COUNTRIES.some(c => (t.country || "").toLowerCase() === c.toLowerCase());
        else if (currentC) matchCountry = tC === currentC;

        return matchInd && matchCountry;
      }).length;

      // Show if it has targets OR it was explicitly created for this country (even if empty)
      if (count > 0 || countries.some(c => (c || "").toLowerCase() === currentC)) {
        const card = createIndustryCard(indName, count);
        card.onclick = () => showIndustryDetails(indName);
        grid.appendChild(card);
      }
    }
  });
}

function renderCountryGrid() {
  const grid = $("countryGridContainer");
  if (!grid) return;
  grid.innerHTML = "";

  const tArr = Array.isArray(targets) ? targets : [];

  // Show each country card (no Global aggregate)
  COUNTRIES.forEach(c => {
    const count = tArr.filter(t => (t.country || "").toLowerCase() === c.toLowerCase()).length;
    const card = createCountryCard(c, count);
    card.onclick = () => showCountryDetails(c);
    grid.appendChild(card);
  });

  // Always show "Other" for uncategorized data
  const otherCount = tArr.filter(t => {
    const c = (t.country || "").trim().toLowerCase();
    return !c || (c !== "global" && !COUNTRIES.map(x => x.toLowerCase()).includes(c));
  }).length;
  const otherCard = createCountryCard("Other", otherCount, "bi-geo-alt");
  otherCard.onclick = () => showCountryDetails("Other");
  grid.appendChild(otherCard);
}

function createCountryCard(name, count, icon = null) {
  const div = document.createElement("div");
  div.className = "industry-card";
  const label = (name === "Global" || name === "Other") ? name : `Work ${name}`;

  // Mapping for FlagCDN (ISO 2-letter codes)
  const ISO_MAP = {
    "Canada": "ca", "Germany": "de", "Australia": "au", "Austria": "at", "Luxembourg": "lu",
    "Netherlands": "nl", "Ireland": "ie", "Sweden": "se", "UAE": "ae", "Switzerland": "ch", "India": "in"
  };

  let iconHtml = "";
  if (icon) {
    iconHtml = `<i class="bi ${icon}"></i>`;
  } else if (ISO_MAP[name]) {
    iconHtml = `<img src="https://flagcdn.com/w80/${ISO_MAP[name]}.png" srcset="https://flagcdn.com/w160/${ISO_MAP[name]}.png 2x" width="40" alt="${name} flag" style="border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">`;
  } else {
    iconHtml = `<span style="font-size: 2rem;">≡ƒîÅ</span>`; // World emoji for Global/Other
  }

  div.innerHTML = `
        <div class="industry-icon" style="background: rgba(37, 99, 235, 0.05); width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; border: 1px solid rgba(37, 99, 235, 0.1);">
          ${iconHtml}
        </div>
        <div class="fw-bold" style="font-size: 0.95rem; color: #1e293b;">${escapeHtml(label)}</div>
        <div class="text-muted small">${count} HR Contacts</div>
    `;
  return div;
}

function showCountryDetails(country) {
  currentSelectedCountry = country;
  if ($("countryGridContainer")) $("countryGridContainer").classList.add("d-none");
  if ($("industryGridContainer")) $("industryGridContainer").classList.remove("d-none");
  if ($("industryDetailsSection")) $("industryDetailsSection").classList.add("d-none");

  // Show Industry-level tools
  if ($("industryAddBtn")) $("industryAddBtn").classList.remove("d-none");
  if ($("targetsClearBtn")) $("targetsClearBtn").classList.remove("d-none");

  if ($("targetGridHeader")) {
    $("targetGridHeader").classList.remove("d-none");
    if ($("targetGridTitle")) {
      const flag = COUNTRY_MAP[country] || "";
      $("targetGridTitle").innerHTML = `${flag} Industries for Work ${country}`;
    }
  }
  renderIndustryGrid(industriesList);
}

window.backToCountries = () => {
  currentSelectedCountry = null;
  currentSelectedIndustry = null;
  if ($("industryDetailsSection")) $("industryDetailsSection").classList.add("d-none");
  if ($("industryGridContainer")) $("industryGridContainer").classList.add("d-none");
  if ($("targetGridHeader")) $("targetGridHeader").classList.add("d-none");
  if ($("countryGridContainer")) $("countryGridContainer").classList.remove("d-none");

  // Hide Industry-level tools
  if ($("industryAddBtn")) $("industryAddBtn").classList.add("d-none");
  if ($("targetsClearBtn")) $("targetsClearBtn").classList.add("d-none");

  renderCountryGrid();
};

function createIndustryCard(name, count, icon = "bi-briefcase-fill") {
  const div = document.createElement("div");
  div.className = "industry-card";
  let delHtml = "";
  if (name !== "All Industries") {
    delHtml = `<button class="btn btn-sm btn-outline-danger delete-ind-btn" onclick="event.stopPropagation(); deleteIndustry('${name}')"><i class="bi bi-x"></i></button>`;
  }
  div.innerHTML = `
        ${delHtml}
        <div class="industry-icon"><i class="bi ${icon}"></i></div>
        <div class="fw-bold">${escapeHtml(name)}</div>
        <div class="text-muted small">${count} HR Contacts</div>
    `;
  return div;
}

async function deleteIndustry(name) {
  const countryQuery = currentSelectedCountry ? `?country=${encodeURIComponent(currentSelectedCountry)}` : "";
  const confirmMsg = currentSelectedCountry
    ? `Delete Industry Type '${name}' and all associated contacts for ${currentSelectedCountry}?`
    : `Delete Industry Type '${name}'?`;

  if (!confirm(confirmMsg)) return;

  try {
    await apiJson(`/api/targets/industries/${encodeURIComponent(name)}${countryQuery}`, { method: "DELETE" });
    toast(`Industry '${name}' deleted successfully`, "success");
    await refreshTargets();
    await refreshIndustries();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

function showIndustryDetails(industry) {
  currentSelectedIndustry = industry;
  if ($("industryGridContainer")) $("industryGridContainer").classList.add("d-none");
  if ($("targetGridHeader")) $("targetGridHeader").classList.add("d-none");
  if ($("industryDetailsSection")) $("industryDetailsSection").classList.remove("d-none");

  // Hide Industry-level tools (keep focus on Target list tools)
  if ($("industryAddBtn")) $("industryAddBtn").classList.add("d-none");
  if ($("targetsClearBtn")) $("targetsClearBtn").classList.add("d-none");

  applyCurrentFilters();
}

function applyCurrentFilters() {
  const q = ($("targetsSearch")?.value || "").trim().toLowerCase();

  const filtered = targets.filter(t => {
    // Basic Search
    const matchesText = !q || (
      (t.company_name || "").toLowerCase().includes(q) ||
      (t.hr_email || "").toLowerCase().includes(q) ||
      (t.target_role || "").toLowerCase().includes(q) ||
      (t.hr_name || "").toLowerCase().includes(q) ||
      (t.country || "").toLowerCase().includes(q) ||
      (t.industry || "").toLowerCase().includes(q)
    );

    // Drill-down filters
    let matchesCountry = true;
    if (currentSelectedCountry === "Other") {
      const c = (t.country || "").trim().toLowerCase();
      matchesCountry = !c || c === "global" || !COUNTRIES.some(cc => cc.toLowerCase() === c);
    } else if (currentSelectedCountry) {
      matchesCountry = (t.country || "").toLowerCase() === currentSelectedCountry.toLowerCase();
    }

    const matchesInd = !currentSelectedIndustry || (t.industry || "").toLowerCase() === currentSelectedIndustry.toLowerCase();

    return matchesText && matchesCountry && matchesInd;
  });

  // Update Title
  if ($("selectedIndustryTitle")) {
    let title = currentSelectedCountry ? `Work ${currentSelectedCountry}` : "Global";
    if (currentSelectedIndustry) title += ` - Industry: ${currentSelectedIndustry}`;
    else title += " - All Industries";
    $("selectedIndustryTitle").textContent = title;
  }

  // Show/Hide back buttons
  if ($("backToIndustriesBtn")) $("backToIndustriesBtn").classList.toggle("d-none", !currentSelectedCountry);
  if ($("backToCountriesBtn")) $("backToCountriesBtn").classList.toggle("d-none", !currentSelectedCountry);

  // Hide upload/add UI if no specific industry is selected (Enforcing Industry-first upload)
  const uploadBtn = document.querySelector("#industryDetailsSection .btn-outline-primary.mb-0");
  const addTargetBtn = $("targetNewBtn");
  if (uploadBtn) uploadBtn.parentElement.classList.toggle("d-none", !currentSelectedIndustry);
  if (addTargetBtn) addTargetBtn.classList.toggle("d-none", !currentSelectedIndustry);

  renderTargets(filtered);
}

$("backToIndustriesBtn")?.addEventListener("click", () => {
  $("industryDetailsSection").classList.add("d-none");
  $("industryGridContainer").classList.remove("d-none");
  $("targetGridHeader").classList.remove("d-none");
});

$("backToCountriesBtn")?.addEventListener("click", backToCountries);

async function refreshTargets() {
  targets = await apiJson("/api/targets");
  const summary = await apiJson("/api/targets/summary");
  if ($("targetsSummary")) $("targetsSummary").textContent = `Total ${summary.total} | Invalid ${summary.invalid}`;
  if ($("targetsBadge")) $("targetsBadge").textContent = `Targets: ${summary.total}`;

  // If we are currently in a detailed view, update the filtered list
  const isDetailsVisible = $("industryDetailsSection") && !$("industryDetailsSection").classList.contains("d-none");
  if (isDetailsVisible) {
    applyCurrentFilters();
  } else {
    // Otherwise just update counts in the grids
    const targetsTab = $("tab-targets");
    if (targetsTab && !targetsTab.classList.contains("d-none")) {
      if ($("countryGridContainer") && !$("countryGridContainer").classList.contains("d-none")) renderCountryGrid();
      if ($("industryGridContainer") && !$("industryGridContainer").classList.contains("d-none")) renderIndustryGrid(industriesList);
    }
  }
  void loadWfIndustryCountryDatalists();
}

$("targetsRefreshBtn").addEventListener("click", refreshTargets);
$("targetsSearch").addEventListener("input", refreshTargets);

function buildCrmExportUrl(mode) {
  const params = new URLSearchParams({ mode });
  if (currentSelectedIndustry) params.set("industry", currentSelectedIndustry);
  if (currentSelectedCountry === "Other") {
    params.set("country_other", "1");
  } else if (currentSelectedCountry) {
    params.set("country", currentSelectedCountry);
  }
  return `/api/targets/export/crm?${params.toString()}`;
}

function openCrmExport(mode) {
  window.open(buildCrmExportUrl(mode), "_blank", "noopener,noreferrer");
}

$("targetsCrmExportFull")?.addEventListener("click", () => openCrmExport("full"));
$("targetsCrmExportDedup")?.addEventListener("click", () => openCrmExport("dedup"));

$("targetsClearBtn").addEventListener("click", async () => {
  if (!confirm("Clear all targets?")) return;
  try {
    await apiJson("/api/targets/clear", { method: "POST", body: JSON.stringify({}) });
    await refreshTargets();
  } catch (err) {
    alert("Clear failed: " + err.message);
  }
});

$("targetsImportXlsx").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("excel", f);
  if (currentSelectedIndustry) fd.append("industry", currentSelectedIndustry);
  if (currentSelectedCountry && currentSelectedCountry !== "Other") fd.append("country", currentSelectedCountry);
  try {
    const res = await apiForm("/api/targets/import", fd);
    alert(`Targets imported. Inserted: ${res.inserted}, Duplicates Skipped: ${res.duplicates}`);
    await refreshTargets();
    await refreshIndustries();
    if (currentSelectedIndustry) showIndustryDetails(currentSelectedIndustry);
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    e.target.value = "";
  }
});


// Target modal logic
const targetModal = new bootstrap.Modal(document.getElementById("targetModal"));
function openTargetModal(target = null) {
  $("tId").value = target?.id ?? "";
  $("tCompany").value = target?.company_name ?? "";
  $("tRole").value = target?.target_role ?? "";
  $("tEmail").value = target?.hr_email ?? "";
  $("tCountry").value = target?.country ?? "Germany";
  $("tName").value = target?.hr_name ?? "Nil";
  const ind =
    (target?.industry && String(target.industry).trim()) ||
    (currentSelectedIndustry && String(currentSelectedIndustry).trim()) ||
    "Default";
  $("tIndustry").value = ind;
  $("tDeleteBtn").style.display = target?.id ? "inline-block" : "none";
  $("targetModalTitle").textContent = target?.id ? `Edit Target #${target.id}` : "New Target";
  targetModal.show();
}

$("targetNewBtn").addEventListener("click", () => {
  openTargetModal(null);
});

$("targetsTbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === "edit") {
    const target = targets.find(t => String(t.id) === String(id));
    openTargetModal(target);
  } else if (act === "del") {
    if (!confirm("Delete this target?")) return;
    try {
      await fetch(`/api/targets/${id}`, { method: "DELETE" });
      await refreshTargets();
    } catch (err) {
      alert("Delete failed");
    }
  }
});

$("tSaveBtn").addEventListener("click", async () => {
  try {
    const payload = {
      id: $("tId").value ? parseInt($("tId").value, 10) : undefined,
      company_name: $("tCompany").value.trim(),
      target_role: $("tRole").value.trim(),
      hr_email: $("tEmail").value.trim(),
      country: $("tCountry").value.trim() || "Germany",
      hr_name: $("tName").value.trim() || "Nil",
      industry: $("tIndustry").value.trim() || "Default"
    };
    await apiJson("/api/targets", { method: "POST", body: JSON.stringify(payload) });
    targetModal.hide();
    await refreshTargets();
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

$("tDeleteBtn").addEventListener("click", async () => {
  const id = $("tId").value;
  if (!id) return;
  if (!confirm("Delete this target?")) return;
  await fetch(`/api/targets/${id}`, { method: "DELETE" });
  targetModal.hide();
  await refreshTargets();
});

// ----------------- Workspaces -----------------
let workspaces = [];

const wsModalEl = $("wsModal");
const wsModal = (wsModalEl && window.bootstrap) ? new bootstrap.Modal(wsModalEl) : { show: () => { }, hide: () => { } };

async function refreshWorkspaces() {
  workspaces = await apiJson("/api/workspaces");
  renderWorkspaces(workspaces);

  // Also update workspace modal selects
  const indListRaw = await apiJson("/api/targets/industries");
  const indList = indListRaw.map(i => i?.name || "Default").sort();
  populateSelect($("wsIndustry"), indList, "Select Industry (Optional)");

  const candList = await apiJson("/api/candidates");
  const wsCandSel = $("wsCandidateId");
  wsCandSel.innerHTML = "";
  candList.forEach(c => {
    const o = document.createElement("option");
    o.value = c.id;
    const ind = (c.industry_types || "").trim();
    o.textContent = ind ? `${c.name} — ${ind}` : c.name;
    wsCandSel.appendChild(o);
  });
}

function renderWorkspaces(list) {
  const grid = $("wsListGrid");
  grid.innerHTML = "";

  const scheduled = (list || []).filter(
    (w) => w.automation_enabled && w.automation_next_run
  );
  if (scheduled.length === 0) {
    grid.innerHTML = `<div class="col-12"><div class="alert alert-light border text-center py-5 mb-0 text-muted">No scheduled campaigns yet. Campaigns with automation enabled and a next run time will show here.</div></div>`;
    return;
  }

  // Sort by total sent emails descending
  const sorted = [...scheduled].sort((a, b) => (b.automation_total_sent || 0) - (a.automation_total_sent || 0));

  sorted.forEach(w => {
    const div = document.createElement("div");
    div.className = "col-md-6 col-lg-4";
    const candRec = candidates.find(c => c.id === w.candidate_id);
    const cand = candRec
      ? ((candRec.industry_types || "").trim() ? `${candRec.name} — ${(candRec.industry_types || "").trim()}` : candRec.name)
      : "Unknown";
    const status = w.automation_enabled ? `<span class="badge text-bg-success tt-pill">Active</span>` : `<span class="badge text-bg-secondary tt-pill">Paused</span>`;

    let nextStr = "N/A";
    let futureStr = "";

    if (w.automation_enabled && w.automation_next_run) {
      const nextDate = parseIso(w.automation_next_run);
      nextStr = formatDateTime(w.automation_next_run);

      // Calculate next 3 further dates
      const further = [];
      const interval = w.automation_interval_days || 1;
      for (let i = 1; i <= 3; i++) {
        const d = new Date(nextDate.getTime());
        d.setDate(d.getDate() + (i * interval));
        further.push(formatDateTime(d.toISOString()));
      }
      futureStr = `<div class="mt-1 extra-small text-muted">Further: ${further.join(", ")}</div>`;
    }

    div.innerHTML = `
            <div class="tt-card h-100 p-3">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="fw-bold mb-0">${escapeHtml(w.name)}</h6>
                    ${status}
                </div>
                <div class="text-muted small mb-2">Industry: <b>${escapeHtml(w.industry || "Default")}</b> | Country: <b>${escapeHtml(w.country || "Global")}</b></div>
                <div class="small mb-1">Sender: ${escapeHtml(cand)}</div>
                <div class="small mb-1">Sent: <b class="text-primary">${w.automation_total_sent}</b> / ${w.automation_max_emails}</div>
                <div class="small mb-2 text-black-force fw-bold">Next Run: ${nextStr}</div>
                ${futureStr}
                <button class="btn btn-outline-primary btn-sm w-100 mt-3" data-ws-config="${w.id}">Configure Rules</button>
            </div>
        `;
    grid.appendChild(div);
  });
}

// Delegated listener for Configure Rules
const wsListGrid = $("wsListGrid");
if (wsListGrid) {
  wsListGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ws-config]");
    if (btn) {
      const id = parseInt(btn.dataset.wsConfig, 10);
      loadWorkspace(id);
    }
  });
}

window.loadWorkspace = (id) => {
  const w = workspaces.find(x => x.id === id);
  if (!w) return;
  $("wsId").value = w.id;
  $("wsName").value = w.name;
  $("wsIndustry").value = w.industry || "Default";
  $("wsCountry").value = w.country || "Global";
  $("wsCandidateId").value = w.candidate_id;
  $("wsAutoEnabled").checked = w.automation_enabled;
  $("wsBatchSize").value = w.automation_batch_size;
  $("wsInterval").value = w.automation_interval_days;
  $("wsMaxEmails").value = w.automation_max_emails;

  // Disassemble ISO date for civilian picker
  if (w.automation_next_run) {
    const dt = parseIso(w.automation_next_run);
    $("wsNextRunDate").value = w.automation_next_run.slice(0, 10);
    let hours = dt.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    $("wsNextRunHour").value = hours;
    const mins = dt.getMinutes();
    // Round to nearest option if needed, but usually we use 00, 15, 30, 45
    $("wsNextRunMinute").value = String(mins).padStart(2, '0');
    $("wsNextRunAmPm").value = ampm;
  } else {
    $("wsNextRunDate").value = "";
  }

  // New fields
  const type = w.automation_type || "interval";
  document.getElementsByName("wsType").forEach(r => {
    r.checked = r.value === type;
  });
  toggleWsFields(type);

  $("wsMonthlyTarget").value = w.monthly_target || 200;
  $("wsServiceStart").value = w.service_start_date ? w.service_start_date.slice(0, 10) : "";
  $("wsServiceEnd").value = w.service_end_date ? w.service_end_date.slice(0, 10) : "";

  // Days
  const days = (w.scheduled_days || "").split(",");
  document.querySelectorAll(".ws-day-chk").forEach(chk => {
    chk.checked = days.includes(chk.value);
  });

  $("wsDeleteBtn").style.display = "inline-block";
  wsModal.show();
};

const wsSaveBtn = $("wsSaveBtn");
if (wsSaveBtn) {
  wsSaveBtn.addEventListener("click", async () => {
    try {
      const selectedDays = [];
      document.querySelectorAll(".ws-day-chk:checked").forEach(chk => {
        selectedDays.push(chk.value);
      });

      const wsIdEl = $("wsId");
      const wsNameEl = $("wsName");
      const wsIndEl = $("wsIndustry");
      const wsCandEl = $("wsCandidateId");
      const wsAutoEl = $("wsAutoEnabled");
      const wsBatchEl = $("wsBatchSize");
      const wsIntEl = $("wsInterval");
      const wsMaxEl = $("wsMaxEmails");
      const wsTypeElCheck = document.querySelector('input[name="wsType"]:checked');
      const wsMonthlyEl = $("wsMonthlyTarget");
      const wsStartEl = $("wsServiceStart");
      const wsEndEl = $("wsServiceEnd");

      const payload = {
        id: (wsIdEl && wsIdEl.value) ? parseInt(wsIdEl.value) : null,
        name: wsNameEl ? wsNameEl.value.trim() : "",
        industry: wsIndEl ? wsIndEl.value : "Default",
        country: $("wsCountry") ? $("wsCountry").value : "Global",
        candidate_id: wsCandEl ? parseInt(wsCandEl.value) : null,
        automation_enabled: wsAutoEl ? wsAutoEl.checked : false,
        automation_batch_size: wsBatchEl ? parseInt(wsBatchEl.value) : 10,
        automation_interval_days: wsIntEl ? parseInt(wsIntEl.value) : 2,
        automation_max_emails: wsMaxEl ? parseInt(wsMaxEl.value) : 1000,

        // New fields
        automation_type: wsTypeElCheck ? wsTypeElCheck.value : "interval",
        scheduled_days: selectedDays.join(","),
        monthly_target: wsMonthlyEl ? parseInt(wsMonthlyEl.value) : 200,
        service_start_date: wsStartEl ? wsStartEl.value : "",
        service_end_date: wsEndEl ? wsEndEl.value : ""
      };

      // Assemble civilian time to ISO
      const nrDate = $("wsNextRunDate");
      const nrHour = $("wsNextRunHour");
      const nrMin = $("wsNextRunMinute");
      const nrAmPm = $("wsNextRunAmPm");

      if (nrDate && nrDate.value && nrHour && nrMin && nrAmPm) {
        let hours = parseInt(nrHour.value);
        const mins = nrMin.value;
        const ampm = nrAmPm.value;
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        const timeStr = `${String(hours).padStart(2, '0')}:${mins}:00`;
        payload.automation_next_run = `${nrDate.value}T${timeStr}`;
      }

      await apiJson("/api/workspaces", { method: "POST", body: JSON.stringify(payload) });
      wsModal.hide();
      await refreshWorkspaces();
      alert("Workspace Saved");
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

function toggleWsFields(type) {
  if (type === "schedule") {
    $("wsScheduleFields").classList.remove("d-none");
    $("wsIntervalFields").classList.add("d-none");
  } else {
    $("wsScheduleFields").classList.add("d-none");
    $("wsIntervalFields").classList.remove("d-none");
  }
}

const wsTypeRadios = document.getElementsByName("wsType");
if (wsTypeRadios.length > 0) {
  wsTypeRadios.forEach(r => {
    r.addEventListener("change", (e) => toggleWsFields(e.target.value));
  });
}

function updateServiceEndDate() {
  const startEl = $("wsServiceStart");
  const durationEl = $("wsServiceDuration");
  const endEl = $("wsServiceEnd");
  if (!startEl || !durationEl || !endEl) return;

  const startStr = startEl.value;
  if (!startStr) return;
  const start = parseIso(startStr);
  if (isNaN(start.getTime())) return;

  const months = parseInt(durationEl.value);
  start.setMonth(start.getMonth() + months);
  endEl.value = start.toISOString().slice(0, 10);
}

const serviceStart = $("wsServiceStart");
if (serviceStart) serviceStart.addEventListener("change", updateServiceEndDate);

const serviceDuration = $("wsServiceDuration");
if (serviceDuration) serviceDuration.addEventListener("change", updateServiceEndDate);

$("wsDeleteBtn").addEventListener("click", async () => {
  const id = $("wsId").value;
  if (!id || !confirm("Delete Workspace?")) return;
  try {
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    wsModal.hide();
    await refreshWorkspaces();
  } catch (err) {
    alert("Delete failed");
  }
});

// ----------------- Run Campaign -----------------
let currentRunId = null;
let sse = null;
let runTotal = 0;
let runProgress = 0;
let runSentCount = 0;
let runFailedCount = 0;
let runSkippedCount = 0;

function setRunButtons(running) {
  if ($("pauseRunBtn")) $("pauseRunBtn").disabled = !running;
  if ($("stopRunBtn")) $("stopRunBtn").disabled = !running;
  if ($("startRunBtn")) $("startRunBtn").disabled = running;
  if ($("resumeRunBtn")) $("resumeRunBtn").disabled = !running;
}

function appendLog(msg) {
  const log = $("runLog");
  const div = document.createElement("div");
  div.className = "log-line";

  // Escape HTML but keep special characters for colorizing
  let text = escapeHtml(msg);

  // Colorize based on common markers
  if (text.includes("✅")) {
    div.classList.add("text-success");
  } else if (text.includes("❌") || text.includes("💥")) {
    div.classList.add("text-danger");
  } else if (text.includes("ℹ️") || text.includes("💡")) {
    div.classList.add("text-info");
  } else if (text.includes("⏩") || text.includes("⚠️")) {
    div.classList.add("text-warning");
  }

  // Highlight Candidate Names in brackets [Name]
  text = text.replace(/\[(.*?)\]/g, '<span class="log-candidate">[$1]</span>');

  const now = new Date();
  const logHours = now.getHours();
  const logMinutes = String(now.getMinutes()).padStart(2, '0');
  const logAmPm = logHours >= 12 ? 'PM' : 'AM';
  const civHours = logHours % 12 || 12;
  const logTime = `${civHours}:${logMinutes} ${logAmPm}`;

  div.innerHTML = `<span class="log-time">[${logTime}]</span> ${text}`;
  log.appendChild(div);

  // Auto-scroll logic: reliably find the scroll container
  const container = document.querySelector('.tt-log-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function resetRunUI() {
  runTotal = 0;
  runProgress = 0;
  runSentCount = 0;
  runFailedCount = 0;
  runSkippedCount = 0;
  $("runBar").style.width = "0%";
  $("runMeta").textContent = "—";
  $("runLog").textContent = "Ready.";
  updateLiveCounters();
}

function updateLiveCounters() {
  if ($("runSentBadge")) $("runSentBadge").textContent = runSentCount;
  if ($("runFailedBadge")) $("runFailedBadge").textContent = runFailedCount;
  if ($("runSkippedBadge")) $("runSkippedBadge").textContent = runSkippedCount;
  const label = $("runCounterLabel");
  if (label) {
    if (runTotal > 0) {
      label.textContent = `${runProgress} of ${runTotal} processed`;
    } else if (currentRunId) {
      label.textContent = "Starting...";
    } else {
      label.textContent = "Waiting to start...";
    }
  }
}

function updateBar() {
  if (runTotal <= 0) return;
  const pct = Math.min(100, Math.round((runProgress / runTotal) * 100));
  $("runBar").style.width = pct + "%";
  $("runMeta").textContent = `Run ${currentRunId} | ${runProgress}/${runTotal} (${pct}%)`;
}

function closeSSE() {
  if (sse) {
    sse.close();
    sse = null;
  }
}

function connectRunSSE(runId) {
  closeSSE();
  const streamRunId = parseInt(String(runId), 10);
  sse = new EventSource(`/api/runs/${streamRunId}/progress`);
  sse.onmessage = (ev) => {
    const msg = ev.data || "";
    if (msg.startsWith("RUN:")) {
      currentRunId = msg.split("RUN:")[1];
      appendLog("ℹ️ Connected to run " + currentRunId);
      updateLiveCounters();
      return;
    }
    if (msg.startsWith("TOTAL:")) {
      runTotal = parseInt(msg.split("TOTAL:")[1], 10);
      updateBar();
      updateLiveCounters();
      return;
    }
    if (msg.startsWith("PROGRESS:")) {
      runProgress = parseInt(msg.split("PROGRESS:")[1], 10);
      updateBar();
      updateLiveCounters();
      return;
    }
    if (msg.startsWith("SENT:")) {
      return;
    }
    if (msg.includes("✅") && msg.includes("Sent to")) {
      runSentCount++;
      updateLiveCounters();
    }
    if (msg.includes("❌") && !msg.includes("No targets")) {
      runFailedCount++;
      updateLiveCounters();
    }
    if (msg.includes("⏩")) {
      runSkippedCount++;
      updateLiveCounters();
    }
    if (msg === "DONE") {
      appendLog("✅ DONE");
      setRunButtons(false);
      if ($("pauseRunBtn")) $("pauseRunBtn").classList.remove("d-none");
      if ($("resumeRunBtn")) $("resumeRunBtn").classList.add("d-none");
      closeSSE();
      currentRunId = null;
      updateLiveCounters();
      refreshRuns();
      if (streamRunId) {
        setTimeout(() => {
          void downloadCrmManifest(streamRunId, { quiet: false });
        }, 900);
      }
      return;
    }
    appendLog(msg);
  };
  sse.onerror = () => {
    appendLog("⚠️ Lost connection to run stream. Retrying...");
    setTimeout(() => {
      if (currentRunId) connectRunSSE(currentRunId);
    }, 5000);
  };
}

$("startRunBtn").addEventListener("click", async () => {
  try {
    resetRunUI();
    const mode = $("runMode").value;
    const delay = parseInt($("runDelay").value, 10);
    const enableBounceCheck = $("bounceCheckChk").checked;
    const industry = $("runIndustry") ? $("runIndustry").value : "Default";
    const country = $("runCountry") ? $("runCountry").value : "Global";

    let candidateIds = [];
    if (mode === "single" || mode === "selected") {
      document.querySelectorAll("#candPickList input[type=checkbox]:checked").forEach(cb => {
        candidateIds.push(parseInt(cb.value, 10));
      });
      if (candidateIds.length === 0) {
        alert("Select at least one candidate.");
        return;
      }

      // Multi-tab requirement: if multiple candidates selected, open them in new tabs
      if (candidateIds.length > 1) {
        if (confirm(`Open ${candidateIds.length} tabs for individual candidate runs?`)) {
          candidateIds.forEach(id => {
            const url = new URL(window.location.href);
            url.searchParams.set("auto_run_candidate", id);
            url.searchParams.set("delay", delay);
            url.searchParams.set("bounce", enableBounceCheck);
            url.searchParams.set("country", country);
            url.searchParams.set("industry", industry);
            url.searchParams.set("auto_tab", "tab-run"); // Ensure it opens on Run Now tab
            window.open(url.toString(), '_blank');
          });
          return;
        }
      }
    }

    const res = await apiJson("/api/runs/start", {
      method: "POST",
      body: JSON.stringify({ mode, delay, enableBounceCheck, candidateIds, industry, country })
    });

    currentRunId = res.runId;
    setRunButtons(true);
    appendLog("🚀 Run started: " + currentRunId);
    connectRunSSE(currentRunId);
  } catch (err) {
    alert("Run start failed: " + err.message);
  }
});

/**
 * Handle auto-run parameters from URL
 */
async function handleAutoRunParams() {
  const params = new URLSearchParams(window.location.search);
  const autoCandId = params.get("auto_run_candidate");
  const autoTab = params.get("auto_tab");

  if (autoTab) {
    setActiveTab(autoTab);
  }

  if (autoCandId) {
    console.log("Auto-run detected for candidate:", autoCandId);
    setActiveTab("tab-run");

    // Set settings if provided
    if (params.get("delay")) $("runDelay").value = params.get("delay");
    if (params.get("bounce")) $("bounceCheckChk").checked = params.get("bounce") === "true";
    if (params.get("country")) $("runCountry").value = params.get("country");
    if (params.get("industry")) $("runIndustry").value = params.get("industry");

    // Wait for candidates and picklist to be ready
    let attempts = 0;
    const checkExist = setInterval(() => {
      attempts++;
      const cb = document.querySelector(`#candPickList input[value="${autoCandId}"]`);
      if (cb) {
        clearInterval(checkExist);
        cb.checked = true;
        $("runMode").value = "single";

        // Trigger the start button
        console.log("Auto-starting run...");
        $("startRunBtn").click();

        // Clear params from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("auto_run_candidate");
        url.searchParams.delete("delay");
        url.searchParams.delete("bounce");
        url.searchParams.delete("country");
        url.searchParams.delete("industry");
        url.searchParams.delete("auto_tab");
        window.history.replaceState({}, '', url.toString());
      } else if (attempts > 20) {
        clearInterval(checkExist);
        console.warn("Could not find candidate checkbox for auto-run:", autoCandId);
      }
    }, 500);
  }
}

async function runControl(action) {
  if (!currentRunId) {
    alert("No active run");
    return;
  }
  await apiJson("/api/runs/control", { method: "POST", body: JSON.stringify({ runId: currentRunId, action }) });
}

$("pauseRunBtn").addEventListener("click", async () => {
  try {
    await runControl("pause");
    if ($("pauseRunBtn")) $("pauseRunBtn").classList.add("d-none");
    if ($("resumeRunBtn")) $("resumeRunBtn").classList.remove("d-none");
  } catch (err) {
    alert("Pause failed: " + err.message);
  }
});

$("resumeRunBtn").addEventListener("click", async () => {
  try {
    await runControl("resume");
    if ($("resumeRunBtn")) $("resumeRunBtn").classList.add("d-none");
    if ($("pauseRunBtn")) $("pauseRunBtn").classList.remove("d-none");
  } catch (err) {
    alert("Resume failed: " + err.message);
  }
});

$("stopRunBtn").addEventListener("click", async () => {
  if (!confirm("Stop this run?")) return;
  try {
    await runControl("stop");
  } catch (err) {
    alert("Stop failed: " + err.message);
  }
});

$("goRunsBtn").addEventListener("click", () => {
  setActiveTab("tab-runs");
  refreshRuns();
});

// ----------------- Runs & Reports -----------------
let runs = [];

/** Load full history (server clamps max; see server.py /api/runs). */
const RUNS_LIST_ENDPOINT = "/api/runs?limit=50000";

function fmtIso(iso) {
  return formatDateTime(iso);
}

function toggleRunsDateCustomWrap() {
  const sel = $("runsDateFilter");
  const wrap = $("runsDateCustomWrap");
  if (!sel || !wrap) return;
  if (sel.value === "custom") wrap.classList.remove("d-none");
  else wrap.classList.add("d-none");
}

/**
 * Date filter uses the browser local calendar for Today / Yesterday / custom range.
 * Rolling 7/30 = last N×24h from now (unchanged).
 */
function getRunsDateFilterSpec() {
  const v = (($("runsDateFilter") ? $("runsDateFilter").value : "all") || "all").trim();
  const now = new Date();
  if (v === "all") return { all: true };
  if (v === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { all: false, start, end };
  }
  if (v === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
    return { all: false, start, end };
  }
  const rolling = parseInt(v, 10);
  if (!isNaN(rolling) && rolling > 0) return { all: false, rollingDays: rolling };

  if (v === "custom") {
    const fromStr = ($("runsDateFrom") && $("runsDateFrom").value) || "";
    const toStr = ($("runsDateTo") && $("runsDateTo").value) || "";
    if (!fromStr && !toStr) return { all: true };
    let start = null;
    let end = null;
    if (fromStr) {
      const [y, m, day] = fromStr.split("-").map(Number);
      start = new Date(y, m - 1, day, 0, 0, 0, 0);
    }
    if (toStr) {
      const [y, m, day] = toStr.split("-").map(Number);
      end = new Date(y, m - 1, day, 23, 59, 59, 999);
    }
    if (start && !end) {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }
    if (!start && end) {
      start = new Date(1970, 0, 1, 0, 0, 0, 0);
    }
    if (start && end && start > end) {
      const a = new Date(start.getTime());
      const b = new Date(end.getTime());
      start = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 0, 0, 0, 0);
      end = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59, 999);
    }
    return { all: false, start: start || undefined, end: end || undefined };
  }
  return { all: true };
}

function runMatchesDateFilter(createdAt, spec) {
  if (spec.all) return true;
  const d = parseIso(createdAt);
  if (!d || isNaN(d.getTime())) return true;
  if (spec.rollingDays != null) {
    const now = new Date();
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    return diff <= spec.rollingDays;
  }
  if (spec.start != null && spec.end != null) {
    return d >= spec.start && d <= spec.end;
  }
  if (spec.start != null) return d >= spec.start;
  if (spec.end != null) return d <= spec.end;
  return true;
}

async function refreshRuns(preloaded) {
  runs = preloaded && Array.isArray(preloaded) ? preloaded : await apiJson(RUNS_LIST_ENDPOINT);

  // NOTE: Auto-reconnect to other users' runs has been removed to prevent
  // cross-user log sharing. SSE connections are now only established when
  // a user explicitly starts a run in their tab (via startRunBtn or auto_run_candidate URL param).


  // Populate PA filter from runs (split comma-separated lists)
  const allPa = [];
  for (const r of runs) {
    (r.pa_members || "").split(",").map(s => s.trim()).filter(Boolean).forEach(x => allPa.push(x));
  }
  populateSelect($("runsPaFilter"), uniqueValues(allPa), "All PA Members");

  const q = ($("runsSearch") ? $("runsSearch").value : "").trim().toLowerCase();
  const paSel = ($("runsPaFilter").value || "").trim().toLowerCase();
  const stSel = ($("runsStatusFilter") ? $("runsStatusFilter").value : "").trim().toLowerCase();
  const modeSel = ($("runsModeFilter") ? $("runsModeFilter").value : "").trim().toLowerCase();
  const dateSpec = getRunsDateFilterSpec();

  const filtered = runs.filter(r => {
    if (r.is_deleted) return false;

    const blob = [
      String(r.id || ""),
      r.status || "",
      r.mode || "",
      r.pa_members || "",
      r.candidate_names || ""
    ].join(" ").toLowerCase();

    const matchesSearch = !q || blob.includes(q);
    const matchesStatus = !stSel || (r.status || "").toLowerCase() === stSel;
    const rm = (r.mode || "").toLowerCase();
    let matchesMode = true;
    if (modeSel) {
      if (modeSel === "all") matchesMode = rm === "all";
      else if (modeSel === "single") matchesMode = rm === "single";
      else if (modeSel === "batch") matchesMode = rm.startsWith("batch_");
      else matchesMode = rm === modeSel;
    }

    let matchesPa = true;
    if (paSel) {
      const rPa = (r.pa_members || "").toLowerCase().split(",").map(s => s.trim());
      matchesPa = rPa.includes(paSel);
    }

    const matchesDate = runMatchesDateFilter(r.created_at, dateSpec);

    return matchesSearch && matchesStatus && matchesMode && matchesPa && matchesDate;
  });

  const meta = $("runsListMeta");
  if (meta) {
    const n = runs.filter(r => !r.is_deleted).length;
    meta.textContent =
      filtered.length === n
        ? `Showing all ${filtered.length} run(s) loaded from the server. Scroll the table for older Run IDs.`
        : `Showing ${filtered.length} of ${n} run(s) after filters — click “Clear filters” or widen Status / Mode / PA / date to see the rest.`;
  }

  renderRuns(filtered);
}

function statusBadge(status) {
  const s = (status || "").toLowerCase();
  const map = {
    queued: "secondary",
    running: "primary",
    paused_network: "info",
    done: "success",
    failed: "danger",
    stopped: "warning",
    deleted: "dark"
  };
  const cls = map[s] || "secondary";
  return `<span class="badge text-bg-${cls} tt-pill">${escapeHtml(status || "")}</span>`;
}

function renderRuns(list) {
  const tbody = $("runsTbody");
  tbody.innerHTML = "";
  for (const r of list) {
    const tr = document.createElement("tr");
    const isActive = (r.status || "").toLowerCase() === "running" || (r.status || "").toLowerCase() === "queued" || (r.status || "").toLowerCase() === "paused_network";
    const sentDisplay = r.sent ?? 0;

    let controlsHtml = "";
    if (isActive) {
      controlsHtml = `
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-warning" data-action="pause-run" data-run="${r.id}" title="Pause">
            <i class="bi bi-pause-fill"></i> Pause
          </button>
          <button class="btn btn-outline-danger" data-action="stop-run" data-run="${r.id}" title="Stop">
            <i class="bi bi-stop-fill"></i> Stop
          </button>
        </div>`;
    } else {
      controlsHtml = `<span class="text-muted small">—</span>`;
    }

    tr.innerHTML = `
      <td><strong>${r.id}</strong></td>
      <td>${statusBadge(r.status)}</td>
      <td>${escapeHtml(r.mode)}</td>
      <td class="small">${escapeHtml(r.pa_members || "")}</td>
      <td class="small">${escapeHtml(r.candidate_names || "")}</td>
      <td>${r.total_targets || 0}</td>
      <td>${sentDisplay}</td>
      <td>${r.failed || 0}</td>
      <td title="SMTP rejections + inbox bounce scan (if enabled). Not included in downloaded CSV reports.">${r.bounced || 0}</td>
      <td class="small text-muted">${escapeHtml(fmtIso(r.created_at))}</td>
      <td class="text-center">${controlsHtml}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-primary" data-action="reports" data-run="${r.id}">
            <i class="bi bi-file-earmark-arrow-down me-1"></i>Reports
          </button>
          <button class="btn btn-outline-danger" data-action="delete" data-run="${r.id}" title="Delete run">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}
$("runsRefreshBtn").addEventListener("click", refreshRuns);
$("runsSearch") && $("runsSearch").addEventListener("input", refreshRuns);
$("runsStatusFilter") && $("runsStatusFilter").addEventListener("change", refreshRuns);
$("runsModeFilter") && $("runsModeFilter").addEventListener("change", refreshRuns);
if ($("runsDateFilter")) {
  $("runsDateFilter").addEventListener("change", () => {
    toggleRunsDateCustomWrap();
    void refreshRuns();
  });
}
["runsDateFrom", "runsDateTo"].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener("change", () => {
      if ($("runsDateFilter") && $("runsDateFilter").value === "custom") void refreshRuns();
    });
  }
});
toggleRunsDateCustomWrap();

$("runsPaFilter").addEventListener("change", refreshRuns);

if ($("runsClearFiltersBtn")) {
  $("runsClearFiltersBtn").addEventListener("click", () => {
    if ($("runsSearch")) $("runsSearch").value = "";
    if ($("runsStatusFilter")) $("runsStatusFilter").value = "";
    if ($("runsModeFilter")) $("runsModeFilter").value = "";
    if ($("runsDateFilter")) $("runsDateFilter").value = "all";
    if ($("runsDateFrom")) $("runsDateFrom").value = "";
    if ($("runsDateTo")) $("runsDateTo").value = "";
    toggleRunsDateCustomWrap();
    if ($("runsPaFilter")) $("runsPaFilter").value = "";
    void refreshRuns();
  });
}

if ($("runsCrmManifestByDateBtn")) {
  $("runsCrmManifestByDateBtn").addEventListener("click", () => {
    void downloadCrmManifestByRunsDateFilter();
  });
}

setInterval(async () => {
  try {
    const pane = $("tab-runs");
    if (!pane || pane.classList.contains("d-none")) return;
    const list = await apiJson(RUNS_LIST_ENDPOINT);
    const active = list.some(
      r => !r.is_deleted && ["running", "queued", "paused_network"].includes((r.status || "").toLowerCase())
    );
    if (active) await refreshRuns(list);
  } catch {
    /* ignore */
  }
}, 2000);

const deleteRunModal = document.getElementById("deleteRunModal") ? new bootstrap.Modal(document.getElementById("deleteRunModal")) : null;

function requestDeleteRun(runId) {
  if (!deleteRunModal) {
    if (confirm(`Delete run ${runId}?`)) doDeleteRun(runId);
    return;
  }
  $("deleteRunId").value = runId;
  deleteRunModal.show();
}

async function doDeleteRun(runId) {
  try {
    await apiJson(`/api/runs/${runId}`, { method: "DELETE" });
    toast(`Run ${runId} deleted`, "success");
    await refreshRuns();
  } catch (err) {
    toast(err.message || "Delete failed", "danger");
  }
}

if ($("confirmDeleteRunBtn")) {
  $("confirmDeleteRunBtn").addEventListener("click", async () => {
    const runId = $("deleteRunId").value;
    if (!runId) return;
    await doDeleteRun(runId);
    try { deleteRunModal && deleteRunModal.hide(); } catch { }
  });
}

const reportsModal = new bootstrap.Modal(document.getElementById("reportsModal"));
let reportsModalRunId = null;

/** True if blob looks like JSON (e.g. mistaken runs list saved as “CSV”). */
async function crmDownloadBlobLooksLikeJson(blob) {
  let t = await blob.slice(0, 512).text();
  if (t.length && t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.trimStart();
  return t.startsWith("[") || t.startsWith("{");
}

/** CSV manifest for one run: JSA enrollment URL, Candidates, absolute report path under this app. */
async function downloadCrmManifest(runId, opts = {}) {
  const { quiet } = opts;
  const rid = parseInt(String(runId), 10);
  if (!rid) return;
  const fname = `crm_upload_manifest_run_${rid}.csv`;
  try {
    const res = await fetchWithRetry(`/api/runs/${rid}/reports/crm-manifest?_t=${Date.now()}`, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text();
      if (!quiet) toast(`CRM manifest failed (${res.status}): ${txt.slice(0, 240)}`, "danger");
      return;
    }
    const blob = await res.blob();
    if (await crmDownloadBlobLooksLikeJson(blob)) {
      if (!quiet) {
        toast("Wrong file type (JSON). Hard refresh (Ctrl+F5) and try again.", "danger");
      }
      return;
    }
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
    if (!quiet) toast("CRM upload CSV downloaded (Enrollment ID, Candidates, Report Path).", "success");
  } catch (e) {
    if (!quiet) toast("CRM manifest download failed: " + (e && e.message ? e.message : String(e)), "danger");
  }
}

/** Escape one CSV field (RFC-style); line breaks must be quoted. */
function crmManifestCsvEscapeField(val) {
  const t = String(val ?? "");
  if (/[",\r\n]/.test(t)) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

/** Same columns as server CSV: UTF-8 BOM + CRLF. */
function crmManifestRowsToCsvBlob(rows) {
  const header = ["Enrollment ID", "Candidates", "Report Path"]
    .map(crmManifestCsvEscapeField)
    .join(",");
  const body = (rows || []).map((r) =>
    [crmManifestCsvEscapeField(r.enrollment_id), crmManifestCsvEscapeField(r.candidates), crmManifestCsvEscapeField(r.report_path)].join(",")
  );
  const text = `\ufeff${header}\r\n${body.join("\r\n")}`;
  return new Blob([text], { type: "text/csv;charset=utf-8" });
}

/** Date-only query string (same as Runs table filter) for /api/crm-manifest-export. */
function buildCrmManifestDateQuery() {
  const spec = getRunsDateFilterSpec();
  const p = new URLSearchParams();
  if (!spec.all && spec.rollingDays != null) {
    p.set("rolling_days", String(spec.rollingDays));
  } else if (!spec.all && spec.start != null && spec.end != null) {
    p.set("start", spec.start.toISOString());
    p.set("end", spec.end.toISOString());
  }
  return p.toString();
}

/** One CSV for every candidate report in runs matching the current date filter (Enrollment ID URL, Candidates, Report Path). */
async function downloadCrmManifestByRunsDateFilter() {
  const dateQs = buildCrmManifestDateQuery();
  const qBase = dateQs ? `?${dateQs}&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const qSuffix = qBase;

  const runsQs = new URLSearchParams();
  runsQs.set("download", "crm_manifest_csv");
  runsQs.set("_t", Date.now().toString());
  if (dateQs) {
    new URLSearchParams(dateQs).forEach((v, k) => {
      runsQs.set(k, v);
    });
  }
  const runsManifestQs = new URLSearchParams();
  runsManifestQs.set("manifest", "1");
  runsManifestQs.set("_t", Date.now().toString());
  if (dateQs) {
    new URLSearchParams(dateQs).forEach((v, k) => {
      runsManifestQs.set(k, v);
    });
  }

  /** Dedicated CRM routes first — never the plain /api/runs JSON list. */
  const trySteps = [
    { url: `/api/crm-manifest-data${qSuffix}`, opts: { method: "GET", jsonManifest: true } },
    {
      url: `/api/reports/crm-manifest${qSuffix}`,
      opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    },
    { url: `/api/reports/crm-manifest${qSuffix}`, opts: { method: "GET" } },
    { url: `/api/crm-manifest-export${qSuffix}`, opts: { method: "GET" } },
    { url: `/api/crm-manifest.csv${qSuffix}`, opts: { method: "GET" } },
    { url: `/api/runs?${runsQs.toString()}`, opts: { method: "GET" } },
    { url: `/api/runs?${runsManifestQs.toString()}`, opts: { method: "GET" } },
  ];

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const fname = `crm_upload_manifest_all_runs_${stamp}.csv`;
  try {
    toast("Building CRM manifest CSV (all matching runs)…", "info");
    let lastErr = "";
    let blob = null;
    for (const step of trySteps) {
      const { jsonManifest, ...fetchOpts } = step.opts || {};
      const res = await fetchWithRetry(step.url, fetchOpts, 2, 120000);
      if (!res.ok) {
        lastErr = await res.text().catch(() => "");
        continue;
      }
      if (jsonManifest) {
        let data;
        try {
          data = await res.json();
        } catch (_) {
          lastErr = "crm-manifest-data not JSON";
          continue;
        }
        if (data && data.schema === "crm_manifest_v1" && Array.isArray(data.rows)) {
          blob = crmManifestRowsToCsvBlob(data.rows);
          break;
        }
        lastErr = "crm-manifest-data wrong shape";
        continue;
      }
      const b = await res.blob();
      if (await crmDownloadBlobLooksLikeJson(b)) {
        lastErr = "got JSON (runs list), not CRM CSV";
        continue;
      }
      blob = b;
      break;
    }
    if (!blob) {
      toast(
        `CRM manifest failed: ${(lastErr || "no CSV from server").slice(0, 220)} — restart python server.py from the project folder, then Ctrl+F5.`,
        "danger"
      );
      return;
    }
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
    toast("CRM manifest downloaded: Enrollment ID, Candidates, Report Path.", "success");
  } catch (e) {
    toast("CRM manifest download failed: " + (e && e.message ? e.message : String(e)), "danger");
  }
}

/** Uses fetch + session cookie so CSV download matches other API calls (same-origin). */
async function downloadRunReportCsv(downloadUrl, candidateName, runId) {
  const safe = String(candidateName || "candidate").replace(/[^\w\-]+/g, "_").slice(0, 60);
  const fname = `run_${runId}_${safe}.csv`;
  try {
    const res = await fetchWithRetry(downloadUrl, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text();
      toast(`Download failed (${res.status}): ${txt.slice(0, 240)}`, "danger");
      return;
    }
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  } catch (e) {
    toast("Download failed: " + (e && e.message ? e.message : String(e)), "danger");
  }
}

async function openReports(runId) {
  reportsModalRunId = parseInt(String(runId), 10) || null;
  let items;
  try {
    items = await apiJson(`/api/runs/${runId}/reports`);
  } catch (err) {
    toast(err.message || "Could not load reports", "danger");
    items = [];
  }
  const box = $("reportsList");
  box.innerHTML = "";
  if (!Array.isArray(items)) {
    box.innerHTML = `<div class="text-muted">Could not load reports (unexpected response). Try Refresh.</div>`;
  } else if (items.length === 0) {
    box.innerHTML = `<div class="text-muted">No candidate reports found. If this run sent mail, restart the server, click Refresh, then open Reports again (reports are rebuilt from send history).</div>`;
  } else {
    for (const it of items) {
      const row = document.createElement("div");
      row.className =
        "list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2";
      const left = document.createElement("div");
      left.innerHTML = `<strong>${escapeHtml(it.candidate_name)}</strong><div class="text-muted small">Download CSV report</div>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary btn-sm";
      btn.textContent = "Download CSV";
      btn.addEventListener("click", () => downloadRunReportCsv(it.download_url, it.candidate_name, runId));
      row.appendChild(left);
      row.appendChild(btn);
      box.appendChild(row);
    }
  }
  reportsModal.show();
}

if ($("reportsCrmManifestBtn")) {
  $("reportsCrmManifestBtn").addEventListener("click", () => {
    if (reportsModalRunId) void downloadCrmManifest(reportsModalRunId);
    else toast("Open Reports from a run first.", "warning");
  });
}

$("runsTbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-run]");
  if (!btn) return;
  const runId = btn.dataset.run;
  const action = btn.dataset.action || "reports";
  if (action === "reports") {
    openReports(runId);
  } else if (action === "delete") {
    requestDeleteRun(runId);
  } else if (action === "pause-run") {
    try {
      await apiJson("/api/runs/control", { method: "POST", body: JSON.stringify({ runId, action: "pause" }) });
      toast(`Run ${runId} paused`, "success");
      refreshRuns();
    } catch (err) { toast("Pause failed: " + err.message, "danger"); }
  } else if (action === "stop-run") {
    if (!confirm(`Stop run ${runId}?`)) return;
    try {
      await apiJson("/api/runs/control", { method: "POST", body: JSON.stringify({ runId, action: "stop" }) });
      toast(`Run ${runId} stopped`, "success");
      refreshRuns();
    } catch (err) { toast("Stop failed: " + err.message, "danger"); }
  }
});

// ----------------- Init -----------------

// ----------------- Role Analysis -----------------
let roleAnalysisData = null;
let candidateToMove = null; // { id, name }

function syncRoleViewModeHint() {
  const hint = $("roleViewModeHint");
  if (!hint) return;
  const groups = document.querySelector('input[name="roleViewMode"]:checked')?.value === "groups";
  hint.textContent = groups
    ? "Folders and draggable role tags"
    : "Spreadsheet view — Cut a row, switch to Board, then Paste on a folder";
}

async function openCandidateProfileFromRole(candidateId) {
  const id = parseInt(String(candidateId), 10);
  if (!id) return;
  try {
    await loadCandidate(id);
    setActiveTab("tab-candidates");
  } catch (e) {
    toast(e.message || "Could not open profile", "danger");
  }
}

async function refreshRoleAnalysis() {
  const loadEl = $("roleAnalysisLoadState");
  const card = $("roleAnalysisCard");
  if (loadEl) {
    loadEl.classList.remove("d-none");
    loadEl.textContent = "Loading…";
  }
  if (card) card.classList.add("tt-role-loading");
  try {
    roleAnalysisData = await apiJson("/api/role-analysis");
    // Load saved custom group overrides
    try {
      const saved = await apiJson("/api/role-groups/override");
      if (saved && typeof saved === "object") customGroupOverrides = saved;
    } catch { /* ignore */ }
    const rc = $("roleStatCandidates");
    const rr = $("roleStatRoles");
    const rg = $("roleStatSmartGroups");
    const rf = $("roleStatFolders");
    if (rc) rc.textContent = roleAnalysisData.total_candidates || 0;
    if (rr) {
      rr.textContent = String(
        roleAnalysisData.total_roles ??
          ((roleAnalysisData.unique_roles || []).length || 0),
      );
    }
    if (rg) {
      rg.textContent = String(
        roleAnalysisData.total_groups ??
          ((roleAnalysisData.group_names || []).length || 0),
      );
    }
    if (rf) rf.textContent = (roleAnalysisData.custom_groups || []).length || 0;

    // Populate role filter dropdown
    const sel = $("roleFilterSelect");
    const currentVal = sel ? sel.value : "";
    const isGrouped = document.querySelector('input[name="roleViewMode"]:checked')?.value === 'groups';

    if (sel) {
      sel.innerHTML = '<option value="">All groups &amp; roles</option>';
      if (isGrouped) {
        // Source groups
        for (const g of (roleAnalysisData.group_names || [])) {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = `${g} (${roleAnalysisData.groups[g].length} roles)`;
          sel.appendChild(opt);
        }
        // Custom folders
        for (const g of (roleAnalysisData.custom_groups || [])) {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = `📁 ${g}`;
          sel.appendChild(opt);
        }
      } else {
        for (const r of (roleAnalysisData.unique_roles || [])) {
          const opt = document.createElement("option");
          opt.value = r;
          opt.textContent = `${r} (${(roleAnalysisData.roles[r] || []).length})`;
          sel.appendChild(opt);
        }
      }
      if (currentVal) sel.value = currentVal;
    }

    syncRoleViewModeHint();
    updateRoleAnalysisView();
  } catch (err) {
    console.error("Role analysis error:", err);
    toast("Role Analysis could not load. Check your connection and try Refresh. " + (err.message || ""), "danger");
  } finally {
    if (loadEl) {
      loadEl.classList.add("d-none");
      loadEl.textContent = "";
    }
    if (card) card.classList.remove("tt-role-loading");
  }
}

function updateRoleAnalysisView() {
  const isGrouped = document.querySelector('input[name="roleViewMode"]:checked')?.value === 'groups';
  const searchQ = ($("roleSearchInput")?.value || "").trim().toLowerCase();

  if (isGrouped) {
    renderRoleFolders(searchQ);
    renderRoleSource(searchQ);
  } else {
    renderRoleAnalysisTable();
  }
}

function renderRoleAnalysisTable() {
  if (!roleAnalysisData) return;
  const tbody = $("roleAnalysisTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Show table, hide grid
  if ($("roleGridContainer")) $("roleGridContainer").classList.add("d-none");
  if ($("roleTableContainer")) $("roleTableContainer").classList.remove("d-none");

  const filterLabel = ($("roleFilterSelect")?.value || "").trim();
  const searchQ = ($("roleSearchInput")?.value || "").trim().toLowerCase();
  const isGrouped = document.querySelector('input[name="roleViewMode"]:checked')?.value === 'groups';

  let displayRows = [];

  if (isGrouped) {
    // Grouped View Logic
    const groupsToRender = filterLabel ? [filterLabel] : (roleAnalysisData.group_names || []);

    for (const gName of groupsToRender) {
      const subRoles = roleAnalysisData.groups[gName] || [];
      // Combine all candidates from all sub-roles in this group
      let groupCandidates = [];
      const seenIds = new Set();

      for (const sRole of subRoles) {
        const cands = roleAnalysisData.roles[sRole] || [];
        for (const c of cands) {
          if (!seenIds.has(c.candidate_id)) {
            seenIds.add(c.candidate_id);
            groupCandidates.push({ ...c, display_role: gName, original_role: sRole });
          }
        }
      }

      // Filter group candidates by search
      if (searchQ) {
        groupCandidates = groupCandidates.filter(c =>
          (c.first_name || "").toLowerCase().includes(searchQ) ||
          (c.last_name || "").toLowerCase().includes(searchQ) ||
          (c.email || "").toLowerCase().includes(searchQ) ||
          (c.enrollment_id || "").toLowerCase().includes(searchQ) ||
          (c.industry_types || "").toLowerCase().includes(searchQ) ||
          (c.role || "").toLowerCase().includes(searchQ) ||
          (c.original_role || "").toLowerCase().includes(searchQ)
        );
      }

      if (groupCandidates.length > 0) {
        groupCandidates.sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""));
        displayRows.push(...groupCandidates.map((c, idx) => ({ ...c, is_group_start: idx === 0, group_count: groupCandidates.length })));
      }
    }
  } else {
    // Individual View Logic
    let rows = roleAnalysisData.flat || [];
    if (filterLabel) {
      rows = rows.filter(r => r.role === filterLabel);
    }
    if (searchQ) {
      rows = rows.filter(r =>
        (r.first_name || "").toLowerCase().includes(searchQ) ||
        (r.last_name || "").toLowerCase().includes(searchQ) ||
        (r.email || "").toLowerCase().includes(searchQ) ||
        (r.enrollment_id || "").toLowerCase().includes(searchQ) ||
        (r.industry_types || "").toLowerCase().includes(searchQ) ||
        (r.role || "").toLowerCase().includes(searchQ)
      );
    }
    rows.sort((a, b) => {
      const rc = (a.role || "").localeCompare(b.role || "");
      if (rc !== 0) return rc;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });
    displayRows = rows.map(r => ({ ...r, display_role: r.role }));
  }

  for (const r of displayRows) {
    const tr = document.createElement("tr");
    if (r.is_group_start && isGrouped) {
      tr.style.borderTop = "2px solid rgba(67,97,238,0.2)";
    }

    const resumeShort = (r.resume_path || "").length > 50
      ? "..." + (r.resume_path || "").slice(-47)
      : (r.resume_path || "");
    const indRa = ((r.industry_types || "").trim());
    const indCell = indRa
      ? `<td class="small" title="${escapeHtml(indRa)}">${escapeHtml(indRa.length > 36 ? indRa.slice(0, 33) + "…" : indRa)}</td>`
      : `<td class="text-muted small">—</td>`;

    const roleCell = isGrouped
      ? `<td>
            <span class="badge text-bg-primary tt-pill">${escapeHtml(r.display_role)}</span>
            ${r.is_group_start ? `<div class="small text-muted mt-1" style="font-size:0.7rem">Sub-role: ${escapeHtml(r.original_role)}</div>` : ""}
           </td>`
      : `<td><span class="badge text-bg-primary tt-pill">${escapeHtml(r.display_role)}</span></td>`;

    const actionCell = `<td class="text-nowrap">
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" class="btn btn-outline-secondary btn-sm role-open-profile-btn"
                data-id="${r.candidate_id}"
                title="Open candidate in Candidates tab">
          <i class="bi bi-person-lines-fill"></i>
        </button>
        <button type="button" class="btn btn-outline-primary btn-sm cut-candidate-btn"
              data-id="${r.candidate_id}"
              data-name="${escapeHtml(r.first_name + ' ' + r.last_name)}"
              title="Cut to move into a folder (switch to Board and Paste)">
        <i class="bi bi-scissors"></i> Cut
      </button>
      </div>
    </td>`;

    tr.innerHTML = `
      ${roleCell}
      <td>${escapeHtml(r.first_name)}</td>
      <td>${escapeHtml(r.last_name)}</td>
      <td>${escapeHtml(r.email)}</td>
      ${indCell}
      <td title="${escapeHtml(r.resume_path)}" class="small text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(resumeShort)}</td>
      <td>${escapeHtml(r.enrollment_id)}</td>
      ${actionCell}
    `;
    tbody.appendChild(tr);
  }

  // Bind Cut buttons
  tbody.querySelectorAll(".cut-candidate-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      candidateToMove = { id: btn.dataset.id, name: btn.dataset.name };
      // Visual feedback: disable all cut buttons, highlight the one cut
      tbody.querySelectorAll(".cut-candidate-btn").forEach(b => b.classList.replace("btn-primary", "btn-outline-primary"));
      btn.classList.replace("btn-outline-primary", "btn-primary");

      // Auto-switch to Folder (Group) view so user sees Paste targets
      const grpRadio = $("roleViewGroups");
      if (grpRadio) {
        grpRadio.checked = true;
        syncRoleViewModeHint();
        updateRoleAnalysisView();
      }

      toast(`Cut "${candidateToMove.name}". Board view opened — click Paste on a green folder to move them.`, "info");
    });
  });

  tbody.querySelectorAll(".role-open-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => openCandidateProfileFromRole(btn.dataset.id));
  });

  if ($("roleTableSummary")) {
    const total = (roleAnalysisData.flat || []).length;
    $("roleTableSummary").textContent =
      displayRows.length === 0
        ? `No rows match (of ${total} role assignments). Clear search or filter.`
        : `Showing ${displayRows.length} row${displayRows.length === 1 ? "" : "s"}`;
  }

  if (displayRows.length === 0 && tbody) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" class="text-center text-muted py-4">No people match this search or filter. Try <strong>Clear search</strong> or choose &quot;All groups &amp; roles&quot;.</td>`;
    tbody.appendChild(tr);
  }
}

function renderRoleFolders(searchQ = "") {
  const workspace = $("roleFoldersWorkspace");
  if (!workspace) return;
  workspace.innerHTML = "";
  workspace.classList.remove("d-none");

  const customFolders = roleAnalysisData.custom_groups || [];

  // Custom folders show candidates override and potentially some auto roles if mapped
  for (const gName of customFolders) {
    if (searchQ && !gName.toLowerCase().includes(searchQ)) continue;

    // Data for this folder: Candidates manually moved + Roles manually moved
    const subRoles = [];
    // Find roles moved to this custom group
    for (const [rName, target] of Object.entries(customGroupOverrides)) {
      if (target === gName) subRoles.push(rName);
    }

    const seenIds = new Set();
    // Candidates manually override to this group
    for (const [cid, target] of Object.entries(roleAnalysisData.candidate_overrides || {})) {
      if (target === gName) seenIds.add(parseInt(cid, 10));
    }
    // Plus candidates from sub-roles moved here
    for (const sr of subRoles) {
      for (const c of (roleAnalysisData.roles[sr] || [])) seenIds.add(c.candidate_id);
    }

    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `
      <div class="card h-100 border-success border-opacity-25 shadow-none" style="border-style: solid; background: white;">
        <div class="card-body p-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <h6 class="card-title mb-0 text-success fw-bold" style="cursor:pointer; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(gName)}</h6>
            <div class="d-flex gap-1 align-items-center">
              <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1 delete-custom-group" title="Delete this folder">
                <i class="bi bi-trash"></i>
              </button>
              <span class="badge bg-success text-white tt-pill">${seenIds.size}</span>
            </div>
          </div>
          <div class="small text-muted mb-1" style="font-size: 0.7rem;">${subRoles.length} roles(s)</div>
          ${candidateToMove ? `
            <button class="btn btn-success btn-sm w-100 mb-2 paste-candidate-btn" data-group="${escapeHtml(gName)}">
              <i class="bi bi-clipboard-check me-1"></i> Paste ${escapeHtml(candidateToMove.name.split(' ')[0])}
            </button>
          ` : ""}
          <div class="role-drop-zone p-1 rounded border border-dashed border-success border-opacity-10" style="min-height: 25px; background: rgba(25,135,84,0.02);">
            ${subRoles.map(r => `
              <span class="role-draggable badge text-bg-success tt-pill mb-1 me-1" draggable="true" data-role="${escapeHtml(r)}" style="font-size:0.65rem; cursor:grab;">${escapeHtml(r)}</span>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    col.querySelector(".card-title").addEventListener("click", () => drillDownRoleGroup(gName));

    // Paste logic
    const pBtn = col.querySelector(".paste-candidate-btn");
    if (pBtn) pBtn.addEventListener("click", () => handlePasteAction(gName));

    // Delete logic
    col.querySelector(".delete-custom-group").addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteGroupAction(gName);
    });

    // Drop Zone events
    const dropZone = col.querySelector(".role-drop-zone");
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.background = "rgba(25,135,84,0.1)";
    });
    col.addEventListener("dragleave", () => {
      dropZone.style.background = "";
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.background = "";
      const roleName = e.dataTransfer.getData("text/plain");
      if (roleName) handleMoveRoleAction(roleName, gName);
    });

    workspace.appendChild(col);
  }

  if (customFolders.length > 0 && !workspace.querySelector(".col")) {
    const row = document.createElement("div");
    row.className = "col-12 text-center text-muted small py-3";
    row.textContent = "No folders match your search — clear the search box or widen your query.";
    workspace.appendChild(row);
  }

  const folderEmpty = $("roleFoldersEmptyHint");
  if (folderEmpty) {
    const hasFolders = (customFolders || []).length > 0;
    folderEmpty.classList.toggle("d-none", hasFolders);
  }
}

function renderRoleSource(searchQ = "") {
  const container = $("roleGridContainer");
  if (!container) return;
  container.innerHTML = "";
  container.classList.remove("d-none");
  if ($("roleTableContainer")) $("roleTableContainer").classList.add("d-none");

  const baseGroups = roleAnalysisData.groups || {};
  const customFolders = roleAnalysisData.custom_groups || [];

  // Working groups are only focus on NON-CUSTOM auto buckets
  let groupNames = Object.keys(baseGroups).filter(gn => !customFolders.includes(gn));

  // Apply search
  if (searchQ) {
    groupNames = groupNames.filter(gn => {
      if (gn.toLowerCase().includes(searchQ)) return true;
      return baseGroups[gn].some(r => r.toLowerCase().includes(searchQ));
    });
  }

  groupNames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  for (const gName of groupNames) {
    const rolesInGroup = baseGroups[gName].filter(r => customGroupOverrides[r] === undefined);
    if (rolesInGroup.length === 0) continue; // always hide empty auto groups

    const seenIds = new Set();
    for (const r of rolesInGroup) {
      for (const c of (roleAnalysisData.roles[r] || [])) seenIds.add(c.candidate_id);
    }

    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `
      <div class="card h-100 tt-card border-primary border-opacity-10 shadow-none">
        <div class="card-body p-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <h6 class="card-title mb-0 text-primary fw-bold" style="cursor:pointer; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(gName)}</h6>
            <span class="badge text-bg-info tt-pill" style="font-size: 0.65rem;">${seenIds.size}</span>
          </div>
          <div class="small text-muted mb-1" style="font-size: 0.7rem;">${rolesInGroup.length} roles</div>
          <div class="role-badges-zone" style="min-height: 25px;">
            ${rolesInGroup.map(r => `
              <span class="role-draggable badge border text-dark tt-pill mb-1 me-1" draggable="true" data-role="${escapeHtml(r)}" style="font-size:0.65rem; cursor:grab;">${escapeHtml(r)}</span>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    col.querySelector(".card-title").addEventListener("click", () => drillDownRoleGroup(gName));
    container.appendChild(col);
  }

  const gridEmpty = $("roleGridEmptyHint");
  if (gridEmpty) {
    const hasCols = container.querySelector(".col");
    gridEmpty.classList.toggle("d-none", !!hasCols);
  }
}

async function handlePasteAction(gName) {
  if (!candidateToMove) return;
  try {
    await apiJson("/api/role-groups/move", {
      method: "POST",
      body: JSON.stringify({ candidate_id: candidateToMove.id, target_group: gName })
    });
    toast(`Successfully moved "${candidateToMove.name}" to "${gName}"`, "success");
    candidateToMove = null;
    refreshRoleAnalysis();
  } catch (err) { toast(err.message, "danger"); }
}

async function handleDeleteGroupAction(gName) {
  if (!confirm(`Delete folder "${gName}"?\n\nDragged roles and candidate moves into this folder will be cleared; people go back to automatic grouping.`)) return;
  try {
    await apiJson("/api/role-groups/custom", { method: "DELETE", body: JSON.stringify({ name: gName }) });
    toast(`Folder "${gName}" deleted`, "success");
    await refreshRoleAnalysis();
  } catch (err) { toast(err.message, "danger"); }
}

async function handleMoveRoleAction(roleName, targetGroup) {
  customGroupOverrides[roleName] = targetGroup;
  try {
    await apiJson("/api/role-groups/override", {
      method: "POST",
      body: JSON.stringify({ overrides: customGroupOverrides })
    });
    refreshRoleAnalysis();
    toast(`Moved "${roleName}" to "${targetGroup}"`, "success");
  } catch (err) { toast(err.message, "danger"); }
}

function drillDownRoleGroup(gName) {
  if (!roleAnalysisData) return;

  const customFolders = roleAnalysisData.custom_groups || [];
  const isCustom = customFolders.includes(gName);
  const seenIds = new Set();
  const candidates = [];

  if (isCustom) {
    const subRoles = [];
    for (const [rName, target] of Object.entries(customGroupOverrides)) {
      if (target === gName) subRoles.push(rName);
    }
    for (const [cid, target] of Object.entries(roleAnalysisData.candidate_overrides || {})) {
      if (target === gName) {
        const id = parseInt(cid, 10);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const found = (roleAnalysisData.flat || []).find(c => c.candidate_id === id);
          if (found) candidates.push(found);
        }
      }
    }
    for (const sr of subRoles) {
      for (const c of (roleAnalysisData.roles[sr] || [])) {
        if (!seenIds.has(c.candidate_id)) {
          seenIds.add(c.candidate_id);
          candidates.push(c);
        }
      }
    }
  } else {
    const baseGroups = roleAnalysisData.groups || {};
    const subRoles = baseGroups[gName] || [];
    for (const sr of subRoles) {
      if (customGroupOverrides[sr] !== undefined) continue;
      for (const c of (roleAnalysisData.roles[sr] || [])) {
        if (!seenIds.has(c.candidate_id)) {
          seenIds.add(c.candidate_id);
          candidates.push(c);
        }
      }
    }
  }

  candidates.sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""));

  // Build table rows
  const tableRows = candidates.map((c, idx) => {
    const ind = ((c.industry_types || "").trim());
    const indHtml = ind
      ? `<td class="px-3 small" title="${escapeHtml(ind)}">${escapeHtml(ind.length > 40 ? ind.slice(0, 37) + "…" : ind)}</td>`
      : `<td class="px-3 text-muted small">—</td>`;
    return `
    <tr>
      <td class="px-3 text-muted">${idx + 1}</td>
      <td class="px-3 fw-semibold">${escapeHtml(c.first_name || "")}</td>
      <td class="px-3">${escapeHtml(c.last_name || "")}</td>
      <td class="px-3"><a href="mailto:${escapeHtml(c.email || "")}" class="text-decoration-none">${escapeHtml(c.email || "")}</a></td>
      ${indHtml}
      <td class="px-3 small text-muted" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(c.resume_path || "")}">${escapeHtml(c.resume_path || "")}</td>
      <td class="px-3">${escapeHtml(c.enrollment_id || "")}</td>
    </tr>
  `;
  }).join("");

  // Remove any existing dynamic modal
  const existingModal = document.getElementById("dynFolderModal");
  if (existingModal) existingModal.remove();

  // Create modal dynamically
  const modalDiv = document.createElement("div");
  modalDiv.id = "dynFolderModal";
  modalDiv.className = "modal fade";
  modalDiv.tabIndex = -1;
  modalDiv.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header" style="background: #0f172a; color: #fff;">
          <h5 class="modal-title"><i class="bi bi-folder2-open me-2"></i>${escapeHtml(gName)}</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-0">
          <div class="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
            <span class="text-muted small"><i class="bi bi-people-fill me-1"></i>${candidates.length} Candidates</span>
            <button class="btn btn-success btn-sm" id="dynFolderDownloadBtn">
              <i class="bi bi-download me-1"></i> Download CSV
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th class="px-3">#</th>
                  <th class="px-3">First Name</th>
                  <th class="px-3">Last Name</th>
                  <th class="px-3">Email</th>
                  <th class="px-3">Industry Types</th>
                  <th class="px-3">Resume Path</th>
                  <th class="px-3">Enrollment ID</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalDiv);

  // Bind download button
  modalDiv.querySelector("#dynFolderDownloadBtn").addEventListener("click", () => {
    downloadFolderCSV(gName, candidates);
  });

  // Clean up modal after it's hidden
  modalDiv.addEventListener("hidden.bs.modal", () => {
    modalDiv.remove();
  });

  // Show the modal
  const bsModal = new bootstrap.Modal(modalDiv);
  bsModal.show();
}

function downloadFolderCSV(folderName, candidates) {
  const headers = ["first_name", "last_name", "email", "industry_types", "resume_path", "enrollment_id"];
  const csvRows = [headers.join(",")];

  for (const c of candidates) {
    const row = headers.map(h => {
      let val = (c[h] || "").toString().replace(/"/g, '""');
      return `"${val}"`;
    });
    csvRows.push(row.join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folderName.replace(/[^a-zA-Z0-9_-]/g, "_")}_candidates.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Wire up role analysis events
document.querySelectorAll('input[name="roleViewMode"]').forEach(radio => {
  radio.addEventListener("change", () => {
    syncRoleViewModeHint();
    refreshRoleAnalysis();
  });
});
if ($("roleRefreshBtn")) $("roleRefreshBtn").addEventListener("click", refreshRoleAnalysis);
if ($("roleFilterSelect")) $("roleFilterSelect").addEventListener("change", updateRoleAnalysisView);
if ($("roleSearchInput")) $("roleSearchInput").addEventListener("input", updateRoleAnalysisView);
if ($("roleSearchInput")) {
  $("roleSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.target.value = "";
      updateRoleAnalysisView();
    }
  });
}
if ($("roleSearchClearBtn")) {
  $("roleSearchClearBtn").addEventListener("click", () => {
    const inp = $("roleSearchInput");
    if (inp) inp.value = "";
    updateRoleAnalysisView();
  });
}
if ($("roleClearFiltersBtn")) {
  $("roleClearFiltersBtn").addEventListener("click", () => {
    const inp = $("roleSearchInput");
    const sel = $("roleFilterSelect");
    if (inp) inp.value = "";
    if (sel) sel.value = "";
    updateRoleAnalysisView();
  });
}
if ($("roleExportBtn")) {
  $("roleExportBtn").addEventListener("click", () => {
    window.location.href = "/api/role-analysis/export";
  });
}

if ($("roleAddGroupBtn") && $("roleNewFolderModal")) {
  $("roleAddGroupBtn").addEventListener("click", () => {
    const inp = $("roleNewFolderInput");
    if (inp) inp.value = "";
    const modalEl = $("roleNewFolderModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    setTimeout(() => inp && inp.focus(), 400);
  });
}

const roleNewFolderConfirmBtn = $("roleNewFolderConfirmBtn");
const roleNewFolderInput = $("roleNewFolderInput");
if (roleNewFolderConfirmBtn) {
  roleNewFolderConfirmBtn.addEventListener("click", async () => {
    const name = (roleNewFolderInput && roleNewFolderInput.value ? roleNewFolderInput.value : "").trim();
    if (!name) {
      toast("Enter a folder name.", "info");
      return;
    }
    try {
      await apiJson("/api/role-groups/custom", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const modalEl = $("roleNewFolderModal");
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
      toast(`Folder "${name}" created`, "success");
      await refreshRoleAnalysis();
    } catch (err) {
      toast(err.message || "Could not create folder", "danger");
    }
  });
}
if (roleNewFolderInput && $("roleNewFolderModal")) {
  roleNewFolderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("roleNewFolderConfirmBtn")?.click();
    }
  });
}

// Workflow 6-Month Service Logic
let workflowPhases = [];
/** Latest `/api/workflow-plans` list for client-side search filtering. */
let cachedWorkflowPlans = [];

function wfPlanSearchNormalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function workflowPlanSearchHay(p) {
  const bits = [
    p.candidate_name,
    p.candidate_email,
    p.country,
    p.industry,
    p.enrollment_id,
    p.candidate_id != null ? String(p.candidate_id) : "",
    p.current_phase != null ? `phase ${p.current_phase}` : "",
    p.current_phase != null ? String(p.current_phase) : "",
  ];
  return wfPlanSearchNormalize(bits.filter(Boolean).join(" "));
}

async function refreshWorkflowPlans() {
  try {
    const plans = await apiJson("/api/workflow-plans");
    cachedWorkflowPlans = Array.isArray(plans) ? plans : [];
    renderWorkflowTable();
    bucklistRepaintOpenBandIfAny();
  } catch (err) {
    toast("Error fetching workflow plans: " + err.message, "danger");
  }
}

function renderWorkflowTable() {
  const tbody = $("wfTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const all = Array.isArray(cachedWorkflowPlans) ? cachedWorkflowPlans : [];
  const q = wfPlanSearchNormalize($("wfPlanSearchInput")?.value || "");
  const plans = q ? all.filter((p) => workflowPlanSearchHay(p).includes(q)) : all;

  if (all.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No active workflow plans found.</td></tr>`;
    return;
  }
  if (plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No plans match your search.</td></tr>`;
    return;
  }

  plans.forEach(p => {
    const tr = document.createElement("tr");
    const progressPct = p.total_target > 0 ? (p.total_applied / p.total_target) * 100 : 0;
    
    let statusBadge = `<span class="badge badge-wf-active">Active</span>`;
    if (p.is_paused || p.status === 'paused') statusBadge = `<span class="badge badge-wf-paused">Paused</span>`;
    if (p.status === 'completed') statusBadge = `<span class="badge badge-wf-completed">Completed</span>`;
    if (p.status === 'expired') statusBadge = `<span class="badge badge-wf-expired">Expired</span>`;
    
    tr.innerHTML = `
      <td>
        <div class="fw-bold">${p.candidate_name}</div>
        <div class="small text-muted">${p.candidate_email || ''}</div>
      </td>
      <td><span class="badge bg-light text-dark border">Phase ${p.current_phase}</span></td>
      <td>
        <div class="d-flex align-items-center gap-2">
           <div class="progress progress-workflow flex-grow-1" style="width: 100px;">
              <div class="progress-bar" style="width: ${progressPct}%"></div>
           </div>
           <span class="small fw-bold">${p.total_applied}/${p.total_target}</span>
        </div>
      </td>
      <td><div class="small text-muted">Day ${p.elapsed_days} of 180</div></td>
      <td>${statusBadge}</td>
      <td class="small">${formatDateTime(p.next_run_date)}${
        p.next_run_date_stored &&
        p.next_run_date &&
        String(p.next_run_date_stored) !== String(p.next_run_date) &&
        (p.status === "active" || !p.status)
          ? `<div class="text-warning-emphasis mt-1" style="font-size:0.72rem;line-height:1.2"><i class="bi bi-info-circle"></i> Next slot if you missed a day (same time daily; Sun skipped). Display time updates until a batch actually runs.</div>`
          : ""
      }</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="sendNowWorkflow(${p.id})" title="Send Now"><i class="bi bi-send-fill" style="margin-right:2px"></i> Send</button>
          ${(p.status === 'paused') ? 
            `<button class="btn btn-outline-success" onclick="resumeWorkflow(${p.id})" title="Resume"><i class="bi bi-play-fill" style="margin-right:2px"></i> Resume</button>` :
            `<button class="btn btn-outline-warning" onclick="pauseWorkflow(${p.id})" title="Pause"><i class="bi bi-pause-fill" style="margin-right:2px"></i> Pause</button>`
          }
          <button class="btn btn-outline-danger" onclick="deleteWorkflow(${p.id})" title="Stop/Delete"><i class="bi bi-stop-circle" style="margin-right:2px"></i> Stop</button>
          <button class="btn btn-outline-info" onclick="reportWorkflow(${p.candidate_id}, ${p.id})" title="Export"><i class="bi bi-download" style="margin-right:2px"></i> Export</button>
          <button class="btn btn-outline-primary" onclick='openAnalyticsForCandidate(${JSON.stringify(p.candidate_name || "")})' title="Runs &amp; Reports"><i class="bi bi-bar-chart-line" style="margin-right:2px"></i> Analytics</button>
          <button class="btn btn-outline-secondary" onclick="openWorkflowDetail(${p.id})" title="Details"><i class="bi bi-three-dots"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function openWorkflowDetail(planId) {
  try {
    const status = await apiJson(`/api/workflow-plans/${planId}/status`);
    if (!workflowPhases.length) {
      workflowPhases = await apiJson("/api/workflow-phases");
    }
    
    $("wfDetailCandName").textContent = status.candidate_name;
    $("wfDetailApplied").textContent = status.total_applied;
    $("wfDetailTotal").textContent = status.total_target;
    $("wfDetailDay").textContent = `Day ${status.elapsed_days}`;
    $("wfDetailStatus").textContent = status.status === 'paused' ? "Paused" : (status.status.charAt(0).toUpperCase() + status.status.slice(1));
    $("wfDetailPhaseLabel").textContent = `Phase ${status.current_phase}`;
    
    const progressPct = status.total_target > 0 ? (status.total_applied / status.total_target) * 100 : 0;
    const bar = $("wfDetailBar");
    bar.style.width = progressPct + "%";
    bar.textContent = Math.round(progressPct) + "%";
    
    $("wfDetailNextDate").textContent = formatDateTime(status.next_run_date);
    const wfNdNote = $("wfDetailNextNote");
    if (wfNdNote) {
      const drift =
        status.next_run_date_stored &&
        status.next_run_date &&
        String(status.next_run_date_stored) !== String(status.next_run_date);
      wfNdNote.textContent = drift
        ? "Shown time is the next daily slot at your chosen clock time if an earlier run did not execute (e.g. laptop off)."
        : "";
    }
    $("wfDetailBatch").textContent = status.phase_batch_size;
    
    renderPhaseTimeline(status.current_phase);
    
    const modal = new bootstrap.Modal($("wfDetailModal"));
    modal.show();
  } catch (err) {
    toast("Error loading workflow details: " + err.message, "danger");
  }
}

function renderPhaseTimeline(currentPhase) {
  const container = $("wfPhaseTimeline");
  container.innerHTML = "";
  
  for (let i = 1; i <= 6; i++) {
    const step = document.createElement("div");
    step.className = "wf-step";
    if (i < currentPhase) step.classList.add("completed");
    if (i === currentPhase) step.classList.add("active");
    
    step.innerHTML = `
      ${i < currentPhase ? '<i class="bi bi-check-lg"></i>' : i}
      <div class="wf-step-label">P${i}</div>
    `;
    container.appendChild(step);
  }
}

async function adjustWorkflow(planId) {
  try {
    const status = await apiJson(`/api/workflow-plans/${planId}/status`);
    $("wfAdjustId").value = planId;
    $("wfAdjustCandName").textContent = status.candidate_name;
    $("wfAdjustDays").value = status.elapsed_days;
    $("wfAdjustApplied").value = status.total_applied;
    $("wfAdjustTarget").value = status.total_target;
    
    const modal = new bootstrap.Modal($("wfAdjustModal"));
    $("wfAdjustModal").setAttribute("data-candidate-id", status.candidate_id);
    modal.show();
  } catch (err) {
    toast("Error loading plan for adjustment: " + err.message, "danger");
  }
}

async function pauseWorkflow(id) {
  try {
    await apiJson(`/api/workflow-plans/${id}`, { method: "PUT", body: JSON.stringify({ action: "pause" }) });
    refreshWorkflowPlans();
  } catch (err) { toast(err.message, "danger"); }
}

async function resumeWorkflow(id) {
  try {
    await apiJson(`/api/workflow-plans/${id}`, { method: "PUT", body: JSON.stringify({ action: "resume" }) });
    refreshWorkflowPlans();
  } catch (err) { toast(err.message, "danger"); }
}

async function deleteWorkflow(id) {
  if (!confirm("Are you sure you want to stop this workflow plan? It will be deleted permanently.")) return;
  try {
    await apiJson(`/api/workflow-plans/${id}`, { method: "DELETE" });
    refreshWorkflowPlans();
  } catch (err) { toast(err.message, "danger"); }
}

async function sendNowWorkflow(id) {
  try {
    toast("Triggering batch immediately...", "info");
    const res = await apiJson(`/api/workflow-plans/${id}`, { method: "PUT", body: JSON.stringify({ action: "send_now" }) });
    toast(res.message || "Batch triggered successfully", "success");
    refreshWorkflowPlans();
  } catch (err) { toast(err.message, "danger"); }
}

function reportWorkflow(candidateId, planId) {
  window.open(`/api/candidates/${candidateId}/download`, "_blank");
}

/** Open Analytics (Runs & Reports) filtered by candidate name. */
function openAnalyticsForCandidate(name) {
  const q = String(name || "").trim();
  setActiveTab("tab-runs");
  const el = $("runsSearch");
  if (el) el.value = q;
  const pa = $("runsPaFilter");
  if (pa) pa.value = "";
  void refreshRuns();
}

/** Full candidate list for Initialize Workflow Plan modal (dropdown + search). */
let wfModalCandidatesCache = [];

function wfModalCandidateSearchHay(c) {
  return wfPlanSearchNormalize(
    [c.name, c.email, c.industry_types, c.enrollment_id, c.id != null ? String(c.id) : ""].filter(Boolean).join(" ")
  );
}

function rebuildWfCandSelectFromFilter() {
  const select = $("wfCandSelect");
  if (!select) return;
  const norm = wfPlanSearchNormalize($("wfCandSearchInput")?.value || "");
  const prev = select.value;
  select.innerHTML = `<option value="">-- Choose Candidate --</option>`;
  for (const c of wfModalCandidatesCache) {
    const hay = wfModalCandidateSearchHay(c);
    if (norm && !hay.includes(norm)) continue;
    const opt = document.createElement("option");
    opt.value = String(c.id);
    const ind = (c.industry_types || "").trim();
    opt.textContent = ind ? `${c.name} (${c.email}) — ${ind}` : `${c.name} (${c.email})`;
    select.appendChild(opt);
  }
  if (prev && [...select.options].some((o) => o.value === prev)) select.value = prev;
  else select.value = "";
}

async function populateWorkflowCandDropdown() {
  try {
    const cands = await apiJson("/api/candidates");
    wfModalCandidatesCache = Array.isArray(cands) ? cands : [];
    const qInp = $("wfCandSearchInput");
    if (qInp) qInp.value = "";
    rebuildWfCandSelectFromFilter();
  } catch (err) {
    console.error(err);
  }
}

// Global Event Listeners for Workflow
document.addEventListener("DOMContentLoaded", () => {
  cleanupStuckInteractions();

  $("ttDashRefreshBtn")?.addEventListener("click", async () => {
    const b = $("ttDashRefreshBtn");
    if (!b || b.disabled) return;
    b.disabled = true;
    b.classList.add("tt-dash-refresh--busy");
    try {
      await refreshOverviewDashboard();
    } finally {
      b.disabled = false;
      b.classList.remove("tt-dash-refresh--busy");
    }
  });

  wireBucklistUnassignedDelegation();
  wireBucklistColumnHeaders();
  wireBucklistSetupGrid();
  wireBucklistSetupFormOnce();
  wireBucklistBucketSearchOnce();
  void loadWfIndustryCountryDatalists();
  $("bucklistOpenSetupBtn")?.addEventListener("click", () => void openBucklistBandSetupModal(null));
  $("bucklistWaveCloseBtn")?.addEventListener("click", bucklistHideWaveAndPeek);
  $("bucklistWaveDownloadBtn")?.addEventListener("click", () => void bucklistDownloadOpenBandCsv());
  $("bucklistWaveSetupBtn")?.addEventListener("click", () => {
    if (bucklistOpenBandKey) void openBucklistBandSetupModal(bucklistOpenBandKey);
  });
  $("wfPlanSearchInput")?.addEventListener("input", () => renderWorkflowTable());
  $("wfPlanSearchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = "";
      renderWorkflowTable();
    }
  });
  $("wfPlanSearchClearBtn")?.addEventListener("click", () => {
    const inp = $("wfPlanSearchInput");
    if (inp) inp.value = "";
    renderWorkflowTable();
    inp?.focus();
  });
  $("wfCandSearchInput")?.addEventListener("input", () => rebuildWfCandSelectFromFilter());
  $("wfCandSearchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      rebuildWfCandSelectFromFilter();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = "";
      rebuildWfCandSelectFromFilter();
    }
  });
  $("wfCandSearchApplyBtn")?.addEventListener("click", () => rebuildWfCandSelectFromFilter());
  $("wfCandSearchClearBtn")?.addEventListener("click", () => {
    const inp = $("wfCandSearchInput");
    if (inp) inp.value = "";
    rebuildWfCandSelectFromFilter();
    inp?.focus();
  });
  $("bucklistPeekCloseBtn")?.addEventListener("click", () => $("bucklistPeekPanel")?.classList.add("d-none"));
  fillPlacementOfficerDatalist();

  function updateWorkflowProgressHint() {
    const daysEl = $("wfInitialDays");
    const appliedEl = $("wfInitialApplied");
    const hintEl = $("wfCalcHint");
    if (!daysEl || !appliedEl || !hintEl) return;

    const days = Math.max(0, parseInt(daysEl.value, 10) || 0);
    const applied = Math.max(0, parseInt(appliedEl.value, 10) || 0);
    const expected = getExpectedAppliedByDays(days);
    const diff = applied - expected;

    if (days > 180) {
      const remain = Math.max(0, 1200 - applied);
      hintEl.textContent = `Day ${days}: Beyond the 6-month window. Full program cap = 1200. Applied = ${applied}. Remaining to cap = ${remain}.`;
      hintEl.className = remain === 0 ? "small text-success" : "small text-warning";
      return;
    }

    if (diff === 0) {
      hintEl.textContent = `Day ${days}: On-track target = ${expected}. You match it exactly.`;
      hintEl.className = "small text-success";
      return;
    }
    if (diff > 0) {
      hintEl.textContent = `Day ${days}: On-track target = ${expected}. Applied = ${applied}. Ahead by ${diff}.`;
      hintEl.className = "small text-success";
      return;
    }
    hintEl.textContent = `Day ${days}: On-track target = ${expected}. Applied = ${applied}. Behind by ${Math.abs(diff)}.`;
    hintEl.className = "small text-danger";
  }

  if ($("wfInitialDays")) {
    $("wfInitialDays").addEventListener("input", updateWorkflowProgressHint);
  }
  if ($("wfInitialApplied")) {
    $("wfInitialApplied").addEventListener("input", updateWorkflowProgressHint);
  }

  async function openWorkflowPlanModal() {
    await populateWorkflowCandDropdown();
    await loadWfIndustryCountryDatalists();
    const dEl = $("wfStartDate");
    const hEl = $("wfStartHour");
    const mEl = $("wfStartMinute");
    const aEl = $("wfStartAmPm");
    if (dEl && hEl && mEl && aEl) {
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      if (new Date() > now) now.setDate(now.getDate() + 1);
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      dEl.value = dateStr;
      hEl.value = "12";
      mEl.value = "00";
      aEl.value = "PM";
    }
    const scDays = $("svcCalcDays");
    const scApp = $("svcCalcApplied");
    if ($("wfInitialDays") && scDays && String(scDays.value || "").trim() !== "") {
      const d = parseInt(scDays.value, 10);
      if (!Number.isNaN(d) && d >= 0) $("wfInitialDays").value = String(d);
    }
    if ($("wfInitialApplied") && scApp && String(scApp.value || "").trim() !== "") {
      const a = parseInt(scApp.value, 10);
      if (!Number.isNaN(a) && a >= 0) $("wfInitialApplied").value = String(a);
    }
    updateWorkflowProgressHint();
    new bootstrap.Modal($("wfNewModal")).show();
  }

  if ($("wfNewBtn")) {
    $("wfNewBtn").addEventListener("click", () => void openWorkflowPlanModal());
  }
  if ($("svcOpenAutomationBtn")) {
    $("svcOpenAutomationBtn").addEventListener("click", () => void openWorkflowPlanModal());
  }

  if ($("svcCalcDays")) $("svcCalcDays").addEventListener("input", updateServiceCalculator);
  if ($("svcCalcApplied")) $("svcCalcApplied").addEventListener("input", updateServiceCalculator);
  if ($("svcCalcBtn")) $("svcCalcBtn").addEventListener("click", updateServiceCalculator);

  if ($("bucklistRefreshBtn")) {
    $("bucklistRefreshBtn").addEventListener("click", () => {
      refreshBucklist();
    });
  }
  if ($("bucklistFileInput")) {
    $("bucklistFileInput").addEventListener("change", async (e) => {
      const input = e.target;
      const f = input.files && input.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      const msgEl = $("bucklistUploadMsg");
      const msgText = $("bucklistUploadMsgText");
      try {
        const res = await fetch("/api/bucklist/upload", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Upload failed");
        const summary = `${j.message || "Done"} — created ${j.created}, updated ${j.updated}, skipped ${j.skipped}.`;
        if (msgEl && msgText) {
          msgText.textContent = summary;
          msgEl.classList.remove("d-none", "alert-danger");
          msgEl.classList.add("show", "alert-success");
        }
        toast(summary, "success");
        await refreshBucklist();
        await refreshCandidates();
      } catch (err) {
        if (msgEl && msgText) {
          msgText.textContent = err.message || "Upload failed";
          msgEl.classList.remove("d-none", "alert-success");
          msgEl.classList.add("show", "alert-danger");
        }
        toast(err.message || "Upload failed", "danger");
      } finally {
        input.value = "";
      }
    });
  }
  
  if ($("wfSavePlanBtn")) {
    $("wfSavePlanBtn").addEventListener("click", async () => {
      const candidate_id = $("wfCandSelect").value;
      const initial_days = $("wfInitialDays").value || 0;
      const initial_applied = $("wfInitialApplied").value || 0;
      const country = $("wfCountry").value || "";
      const industry = $("wfIndustry").value || "";
      
      let scheduled_start_time = "";
      const dEl = $("wfStartDate");
      const hEl = $("wfStartHour");
      const mEl = $("wfStartMinute");
      const aEl = $("wfStartAmPm");
      if (dEl && hEl && mEl && aEl && dEl.value) {
         let hour = parseInt(hEl.value, 10);
         let minute = parseInt(mEl.value, 10);
         if (isNaN(minute)) minute = 0;
         minute = Math.max(0, Math.min(59, minute));
         mEl.value = String(minute).padStart(2, "0");
         if (aEl.value === 'PM' && hour !== 12) hour += 12;
         if (aEl.value === 'AM' && hour === 12) hour = 0;
         const localStr = `${dEl.value}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
         const dt = new Date(localStr);
         scheduled_start_time = dt.toISOString(); 
      }
      
      if (!candidate_id) {
        return toast("Please select a candidate", "warning");
      }
      
      try {
        const cid = parseInt(candidate_id, 10);
        const d0 = parseInt(initial_days, 10) || 0;
        const a0 = parseInt(initial_applied, 10) || 0;
        await apiJson("/api/workflow-plans", {
          method: "POST",
          body: JSON.stringify({
            candidate_id: cid,
            initial_days: d0,
            initial_applied: a0,
            country,
            industry,
            scheduled_start_time
          })
        });
        try {
          await apiJson(`/api/candidates/${cid}/smart-service`, {
            method: "POST",
            body: JSON.stringify({
              days_in_system: d0,
              smart_baseline_applied: a0,
              smart_country: (country || "").trim() || undefined,
              smart_industry: (industry || "").trim() || undefined,
            }),
          });
        } catch (e) {
          console.warn("smart-service sync after workflow plan:", e);
        }
        bootstrap.Modal.getInstance($("wfNewModal")).hide();
        refreshWorkflowPlans();
        void refreshBucklist();
        toast("Automation scheduled — first batch runs at your chosen time (daily thereafter).", "success");
      } catch (err) {
        toast("Error creating plan: " + err.message, "danger");
      }
    });
  }

  if ($("wfSaveAdjustBtn")) {
    $("wfSaveAdjustBtn").addEventListener("click", async () => {
      const planId = $("wfAdjustId").value;
      const data = {
        action: "adjust",
        initial_days: parseInt($("wfAdjustDays").value) || 0,
        total_applied: parseInt($("wfAdjustApplied").value) || 0,
        total_target: parseInt($("wfAdjustTarget").value) || 1200
      };

      try {
        await apiJson(`/api/workflow-plans/${planId}`, {
          method: "PUT",
          body: JSON.stringify(data)
        });
        bootstrap.Modal.getInstance($("wfAdjustModal")).hide();
        refreshWorkflowPlans();
        toast("Workflow plan updated successfully", "success");
      } catch (err) {
        toast("Error updating plan: " + err.message, "danger");
      }
    });
  }

  // --- Sync with DB Refinement ---
  async function syncCandidateAppCount(candidateId, inputId, btn) {
    if (!candidateId) {
        toast("Please select a candidate first", "warning");
        return;
    }
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "⏳...";
    
    try {
        const resp = await fetch(`/api/candidates/${candidateId}/app-count`);
        const res = await resp.json();
        const el = document.getElementById(inputId);
        if (el && typeof res.count === "number") {
            el.value = res.count;
            toast(`Synced! Found ${res.count} applications in DB.`, "success");
        } else if (res.error) {
            toast("Sync failed: " + res.error, "danger");
        } else {
            toast("Synced.", "success");
        }
    } catch (e) {
        console.error(e);
        toast("Error connecting to server", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
  }

  if ($("wfSyncNewBtn")) {
    $("wfSyncNewBtn").onclick = (e) => {
        const cid = $("wfCandSelect").value;
        syncCandidateAppCount(cid, "wfInitialApplied", e.target);
        setTimeout(updateWorkflowProgressHint, 0);
    };
  }

  if ($("wfSyncAdjustBtn")) {
    $("wfSyncAdjustBtn").onclick = (e) => {
        const cid = $("wfAdjustModal").getAttribute("data-candidate-id");
        syncCandidateAppCount(cid, "wfAdjustApplied", e.target);
    };
  }

  if ($("adminTabChanges")) $("adminTabChanges").addEventListener("click", fetchPendingChanges);
  if ($("adminTabPending")) $("adminTabPending").addEventListener("click", fetchPendingUsers);
  if ($("adminTabAll")) $("adminTabAll").addEventListener("click", fetchAllUsers);

  // Initialize data if on Admin Tab
  if (document.getElementById("tab-admin") && !document.getElementById("tab-admin").classList.contains("d-none")) {
     if (window.location.hash === "#admin") {
         fetchPendingChanges();
     }
  }

  updateServiceCalculator();
});

// Smart Automation: 100% prediction button (delegated; uses data-sa-* — no large JSON in attributes)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".sa-wf-prediction-btn");
  if (!btn || !btn.dataset.saDays) return;
  const pctRaw = btn.dataset.saPct;
  const expRaw = btn.dataset.saExpected;
  const p = {
    candidate_name: decodeURIComponent(btn.dataset.saName || ""),
    days_in_system: parseInt(btn.dataset.saDays || "0", 10),
    total_applied: parseInt(btn.dataset.saApplied || "0", 10),
    total_target: parseInt(btn.dataset.saTarget || "1200", 10),
    prediction_pct:
      pctRaw !== undefined && pctRaw !== ""
        ? parseFloat(pctRaw)
        : undefined,
    expected_applications_by_now:
      expRaw !== undefined && expRaw !== ""
        ? parseInt(expRaw, 10)
        : undefined,
    service_start_utc: decodeURIComponent(btn.dataset.saService || ""),
    workflow_plan_status: decodeURIComponent(btn.dataset.saPlan || ""),
    workflow_phases: [],
  };
  openSaWorkflowPredictionModal(p);
});

document.addEventListener("input", (e) => {
  if (!e.target || e.target.id !== "saModalDaysInput") return;
  const modal = document.getElementById("saWorkflowPhasesModal");
  if (!modal || !modal.classList.contains("show")) return;
  renderSaWorkflowPredictionModal();
});

// Global Drag Handlers for Role Analysis
document.addEventListener("dragstart", (e) => {
  const badge = e.target.closest(".role-draggable");
  if (!badge) return;
  badge.classList.add("dragging-role");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", badge.dataset.role);
});

document.addEventListener("dragend", (e) => {
  const badge = e.target.closest(".role-draggable");
  if (badge) badge.classList.remove("dragging-role");
});

/* --- Vertical Resizer Logic for Role Analysis (V11.0) --- */
(function () {
  let rolePaneResizeActive = false;
  let roleResizeTopPane = null;
  let roleResizeContainer = null;

  function endRolePaneResize() {
    if (!rolePaneResizeActive) return;
    rolePaneResizeActive = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  window.addEventListener(
    "mouseup",
    () => {
      endRolePaneResize();
    },
    true,
  );
  window.addEventListener("blur", endRolePaneResize);

  function initRoleResizer() {
    const resizer = document.getElementById("roleResizer");
    const topPane = document.getElementById("rolePaneTop");
    const container = document.getElementById("roleWorkspaceContainer");
    if (!resizer || !topPane || !container) return;
    roleResizeTopPane = topPane;
    roleResizeContainer = container;

    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      rolePaneResizeActive = true;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!rolePaneResizeActive || !roleResizeTopPane || !roleResizeContainer) return;
      const containerRect = roleResizeContainer.getBoundingClientRect();
      const h = containerRect.height || 1;
      const relativeY = e.clientY - containerRect.top;
      let topHeightPercent = (relativeY / h) * 100;
      if (topHeightPercent < 5) topHeightPercent = 5;
      if (topHeightPercent > 95) topHeightPercent = 95;
      roleResizeTopPane.style.flex = `0 0 ${topHeightPercent}%`;
    });
  }
  const checkExist = setInterval(() => {
    if (document.getElementById("roleResizer")) {
      initRoleResizer();
      clearInterval(checkExist);
    }
  }, 1000);
})();

window.addEventListener("pageshow", () => {
  cleanupStuckInteractions();
});

// --- Page Initialization (Auto-Load Data) ---
(async () => {
  console.log("Initializing Dashboard...");
  try {
    const isOnline = await pingBackend();
    if (isOnline) {
      // 1. Check Roles & Features for UI Filtering
      let initialTab = "tab-dashboard";
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
           const me = await meRes.json();
           const role = String(me.role || "user").toLowerCase();
           
           // Default restrictions for standard users
           let allowed = me.allowed_features;
           if (!allowed && role === "user") {
               // Default features for standard user
               allowed = ["tab-dashboard", "tab-candidates", "tab-results", "tab-role-analysis"];
           }

           if (allowed && Array.isArray(allowed)) {
               document.querySelectorAll("#sideTabs [data-tab]").forEach(tabBtn => {
                   const tabId = tabBtn.getAttribute("data-tab");
                   // Always keep dashboard (unless explicitly removed) and never hide admin tab list item 
                   // (the jinja2 template already handles admin tab presence, so we just filter others)
                   if (!allowed.includes(tabId) && tabId !== "tab-dashboard" && tabId !== "tab-admin") {
                       tabBtn.classList.add("d-none");
                   }
               });
               // if current tab is not allowed, pick the first visible
               if (!allowed.includes(initialTab)) {
                   const firstVis = document.querySelector("#sideTabs [data-tab]:not(.d-none)");
                   if (firstVis) initialTab = firstVis.getAttribute("data-tab");
               }
           }
           
           // UI Tweaks for 'user' role
           if (role === "user") {
               // Change "Save Candidate" to "Submit for Approval"
               const saveBtn = document.getElementById("saveCandidateBtn");
               if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-send-check me-1"></i> Submit for Approval';
               
               // Hide delete buttons for users
               document.querySelectorAll(".btn-delete-candidate, .btn-remove-workspace").forEach(b => b.classList.add("d-none"));
           }
        }
      } catch (e) {
          console.warn("Failed to fetch RBAC config", e);
      }

      // 2. Overview dashboard visible + wait for stats (avoids stuck "Loading…" on KPI cards)
      setActiveTab(initialTab);
      if (initialTab === "tab-dashboard") {
          await refreshOverviewDashboard();
      }

      // 2. Load Core Data
      await refreshCandidates();
      await refreshTargets();
      await refreshWorkspaces();
      await refreshWorkflowPlans();
      await refreshIndustries();
      await refreshRoleAnalysis();
      await refreshRuns();

      // 3. Pre-load Results
      loadResults();

      // 4. Handle Auto-Run params (V16.0)
      await handleAutoRunParams();

      console.log("Dashboard fully initialized.");
    } else {
      console.warn("Backend not reachable during init.");
      toast("Backend is offline. Retrying in 5s...", "danger");
      setTimeout(() => window.location.reload(), 5000);
    }
  } catch (err) {
    console.error("Init Error:", err);
  }
})();