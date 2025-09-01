export default {
/* =========================================================
   OBS / HEADER
   ========================================================= */
  obsNo() {
    return (
      (appsmith.URL.queryParams.obs || "").trim() ||
      (typeof ObservationNoInput !== "undefined"
        ? (ObservationNoInput.text || "").trim()
        : "") ||
      (ObservationForms_ByNo.data?.[0]?.observation_no || "")
    );
  },
  header() { return ObservationForms_ByNo.data?.[0] || {}; },

/* =========================================================
   USERS / POSITIONS
   ========================================================= */
  _userIx: null,
  _norm(s) { return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); },
  _buildUserIndex() {
    const ix = {};
    (Users_GetAll.data || []).forEach(u => {
      const idVal = (u.id ?? u.user_id ?? "");
      const idKey = this._norm(idVal);
      if (idKey) ix["id:" + idKey] = u;

      // also index compact digits (e.g., "u-qa-01" -> "1")
      const d = String(idVal).match(/\d+/g);
      if (d) ix["id:" + String(parseInt(d.join(""), 10))] = u;

      const nameKey = this._norm(u.name);
      if (nameKey) ix["name:" + nameKey] = u;

      const mailKey = this._norm(u.email);
      if (mailKey) ix["email:" + mailKey] = u;
    });
    this._userIx = ix;
    return ix;
  },
  _userBy(userId, name) {
    const ix = this._userIx || this._buildUserIndex();

    const idKey = this._norm(userId);
    if (idKey && ix["id:" + idKey]) return ix["id:" + idKey];

    if (userId) {
      const d = String(userId).match(/\d+/g);
      if (d) {
        const compact = String(parseInt(d.join(""), 10));
        if (ix["id:" + compact]) return ix["id:" + compact];
      }
    }
    const nameKey = this._norm(name);
    if (nameKey && ix["name:" + nameKey]) return ix["name:" + nameKey];

    return {};
  },
  _pos(u)       { return u.position || u.title || u.role || ""; },
  positionFor(userId, name) { return this._pos(this._userBy(userId, name)); },

/* =========================================================
   APPROVALS (formsignedoff)
   ========================================================= */
  signoffs() { return Approvals_GetByForm.data || []; },
  latest(stage, role) {
    const rows = this.signoffs().filter(r => (r.stage || "") === stage && (r.role || "") === role);
    if (!rows.length) return {};
    return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
  },
	
	/* ==== Earliest event date helpers (fix) ==== */

	// Return the current form id (same as you already do)
	formId() {
		return (ObservationForms_ByNo.data?.[0]?.form_id || "").toString();
	},
	
	/* ---- Earliest event date for a stage (first approval/comment) ---- */
	_eventMoment(row) {
		// Pick the earliest meaningful timestamp for a row
		const ts = row?.approved_at || row?.commented_at || row?.created_at || row?.action_date || "";
		const m  = moment(ts);
		return m.isValid() ? m : null;
	},
	
	// Parse a row into a moment() using a strict priority of fields
	_asMomentEarliest(row) {
		// Strictly prefer the explicit event timestamps over the action_date
		const cmt = row?.commented_at ? moment(row.commented_at, "YYYY-MM-DD HH:mm:ss", true) : null;
		if (cmt && cmt.isValid()) return cmt;

		const apv = row?.approved_at ? moment(row.approved_at, "YYYY-MM-DD HH:mm:ss", true) : null;
		if (apv && apv.isValid()) return apv;

		const crt = row?.created_at ? moment(row.created_at, "YYYY-MM-DD HH:mm:ss", true) : null;
		if (crt && crt.isValid()) return crt;

		const act = row?.action_date ? moment(row.action_date, "YYYY-MM-DD", true) : null;
		if (act && act.isValid()) return act;

		return null;
	},

	// Earliest event date for a given stage (black / yellow)
	_firstEventDate(stage, fmt = "YYYY-MM-DD") {
		const fid = this.formId();
		const all = Approvals_GetByForm.data || [];

		// Make sure we only look at the current form & desired stage
		const rows = all.filter(r =>
			(r.form_id || "").toString() === fid &&
			(r.stage || "") === stage
		);

		if (!rows.length) return "";

		const first = _.minBy(rows, r => {
			const m = this._asMomentEarliest(r);
			return m ? m.valueOf() : Infinity;
		});

		const mFirst = this._asMomentEarliest(first);
		return mFirst ? mFirst.format(fmt) : "";
	},

	// Public getters for bindings
	ofiPlanReceivedDate(fmt = "YYYY-MM-DD") {
		return this._firstEventDate("black", fmt);
	},
	ofiEvidenceReceivedDate(fmt = "YYYY-MM-DD") {
		return this._firstEventDate("yellow", fmt);
	},

  // helpers
  _date(v) {
    if (!v) return "";
    const m = moment(v);
    return m.isValid() ? m.format("YYYY-MM-DD") : String(v).slice(0, 10);
  },
  _dateFromLatest(lat) {
    return (
      lat.action_date ||
      (lat.approved_at  ? this._date(lat.approved_at)  : "") ||
      (lat.commented_at ? this._date(lat.commented_at) : "") ||
      (lat.created_at   ? this._date(lat.created_at)   : "")
    );
  },
  _status(decision) {
    const d = (decision || "").toLowerCase();
    if (d === "approved")      return "Approved";
    if (d === "not approved")  return "Not Approved";
    return "Pending";
  },

  // ----- ISSUED BY (from header) -----
  issuedBlock() {
    const h = this.header();
    return {
      name: h.issued_by_name || "",
      position: this.positionFor(h.issued_by_user_id, h.issued_by_name) || "",
      // required by you: use observationforms.date_submitted
      date: this._date(h.date_submitted)
    };
  },

  // ----- RED (finding) snapshot with better position fallback -----
  red(role) {
    const h   = this.header();
    const lat = this.latest("red", role);
    const idKey = `${role}_user_id`;
    const nmKey = `${role}_name`;

    // Prefer position captured in the sign-off row; else look up in users table
    const position =
      (lat.position || "").trim() ||
      this.positionFor(h[idKey], h[nmKey]) || "";

    return {
      name:    h[nmKey] || lat.name || "",
      position,
      date:    this._dateFromLatest(lat), // red rows show their own action/approved/commented date
      status:  this._status(lat.decision),
    };
  },

/* =========================================================
   BLUE (OFI acknowledgement)
   ========================================================= */
  blueAttention()   { return this.latest("blue", "attention_to"); },
  attentionStatus() { return this._status(this.blueAttention().decision); },
  assigneeAckStatus() {
    const d = (this.blueAttention().decision || "");
    if (!d) return "Pending";
    return d.toLowerCase() === "approved" ? "Approved" : "Not Approved";
  },

/* =========================================================
   PLAN REPLY (planreply)
   ========================================================= */
  _latestPlan() {
    const fid = this.formId();
    return _.maxBy(
      (PlanReply_GetByForm.data || []).filter(r => r.form_id === fid),
      r => moment(r.updated_at || r.created_at || r.reply_date).valueOf()
    ) || {};
  },
  ofiText()       { return this._latestPlan().ofi_text || ""; },
  ofiTargetDate() { return this._date(this._latestPlan().target_date); },
  ofiReplyName()  { return this._latestPlan().reply_by_name || this.header().assigned_to_name || ""; },
  ofiReplyPos()   { return this._latestPlan().reply_by_position ||
                           this.positionFor(this.header().assigned_to_user_id, this.header().assigned_to_name) || ""; },
  ofiReplyDate()  { return this._date(this._latestPlan().reply_date || this._latestPlan().created_at); },

/* =========================================================
   BLACK (plan verification) & YELLOW (evidence verification)
   ========================================================= */
  black(role) {
    const h   = this.header();
    const lat = this.latest("black", role);
    const idKey = `${role}_user_id`;
    const nmKey = `${role}_name`;

    const position =
      (lat.position || "").trim() ||
      this.positionFor(h[idKey], h[nmKey]) || "";

    return {
      name:    h[nmKey] || lat.name || "",
      position,
      date:    this._dateFromLatest(lat),
      status:  this._status(lat.decision),
    };
  },

  yellow(role) {
    const h   = this.header();
    const lat = this.latest("yellow", role);
    const idKey = `${role}_user_id`;
    const nmKey = `${role}_name`;

    const position =
      (lat.position || "").trim() ||
      this.positionFor(h[idKey], h[nmKey]) || "";

    return {
      name:    h[nmKey] || lat.name || "",
      position,
      date:    this._dateFromLatest(lat),
      status:  this._status(lat.decision),
    };
  },

/* =========================================================
   PAGE STATUS (no header write-back)
   ========================================================= */
  computedStatus() {
    // Highest: Yellow (both approved)
    const yRev = (this.latest("yellow", "reviewer").decision || "").toLowerCase();
    const yApp = (this.latest("yellow", "approver").decision || "").toLowerCase();
    if (yRev === "approved" && yApp === "approved") return "OFI EVIDENCE APPROVED";

    // Next: Black (both approved)
    const bRev = (this.latest("black", "reviewer").decision || "").toLowerCase();
    const bApp = (this.latest("black", "approver").decision || "").toLowerCase();
    if (bRev === "approved" && bApp === "approved") return "OFI PLAN APPROVED";

    // Next: Blue attention approved
    if ((this.blueAttention().decision || "").toLowerCase() === "approved") return "OFI APPROVED";

    // Else if red all four approved
    const roles = ["reviewer","approver","assigned_to","attention_to"];
    const redAll = roles.every(r => (this.latest("red", r).decision || "").toLowerCase() === "approved");
    if (redAll) return "FINDING APPROVED";

    return "OPEN";
  },

/* =========================================================
   INITIAL LOAD
   ========================================================= */
  async init() {
    await Users_GetAll.run();
    await ObservationForms_ByNo.run();
    const fid = this.formId();
    if (!fid) return;

    await Approvals_GetByForm.run({ form_id: fid }); // red/blue/black/yellow
    await PlanReply_GetByForm.run({ form_id: fid }); // OFI plan text+target
  }
};
