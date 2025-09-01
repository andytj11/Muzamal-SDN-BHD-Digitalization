export default {
  // Which section is being signed (use "red" now; you can reuse for "blue"/"yellow" later)
  stage: "red",

  // Roles that must sign
  roles: ["reviewer", "approver", "assigned_to", "attention_to"],

  // -------- Header helpers (from observationforms via ObservationForms_ByNo) --------
  header() { return ObservationForms_ByNo.data?.[0] || {}; },
  formId() { return this.header().form_id || ""; },

  // -------- Approvals data (from formsignedoff via Approvals_GetByForm) --------
  allSignoffs() { return Approvals_GetByForm.data || []; },

  // Latest record for a role in this.stage (append-only, pick the most recent)
  latest(role) {
    const rows = (this.allSignoffs() || []).filter(
      r => (r.stage || "") === this.stage && (r.role || "") === role
    );
    if (!rows.length) return {};
    return _.maxBy(
      rows,
      r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()
    ) || {};
  },

  isApproved(role) {
    return (this.latest(role).decision || "").toLowerCase() === "approved";
  },

  // Derive page status from current decisions (no header update needed)
	computedStatus() {
		const all = Approvals_GetByForm.data || [];

		// Helper: latest row by stage + role (most-recent approved/commented/created)
		const latest = (stage, role) => {
			const rows = all.filter(
				r => (r.stage || "") === stage && (r.role || "") === role
			);
			if (!rows.length) return {};
			return _.maxBy(
				rows,
				r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()
			) || {};
		};

		/* ---- YELLOW BOX: evidence verification (highest precedence) ---- */
		const yellowReviewer = (latest("yellow", "reviewer").decision || "").toLowerCase();
		const yellowApprover = (latest("yellow", "approver").decision || "").toLowerCase();
		if (yellowReviewer === "approved" && yellowApprover === "approved") {
			return "OFI EVIDENCE APPROVED";
		}

		/* ---- BLACK BOX: plan verification ---- */
		const blackReviewer = (latest("black", "reviewer").decision || "").toLowerCase();
		const blackApprover = (latest("black", "approver").decision || "").toLowerCase();
		if (blackReviewer === "approved" && blackApprover === "approved") {
			return "OFI PLAN APPROVED";
		}

		/* ---- BLUE BOX: OFI acknowledged by Attention To ---- */
		const blueAttention = (latest("blue", "attention_to").decision || "").toLowerCase();
		if (blueAttention === "approved") {
			return "OFI APPROVED";
		}

		/* ---- RED BOX: finding approved by all four roles ---- */
		const roles = ["reviewer", "approver", "assigned_to", "attention_to"];
		const findingApproved = roles.every(
			role => (latest("red", role).decision || "").toLowerCase() === "approved"
		);
		if (findingApproved) return "FINDING APPROVED";

		// Default when none of the above has reached approval
		return "OPEN";
	},


  async load() {
    await ObservationForms_ByNo.run();
    if (!this.formId()) { showAlert("Observation number not found.", "warning"); return; }
    await Approvals_GetByForm.run();   // pulls all sign-offs for this form
  },

  // -------- UI widget mapping (EDIT these IDs to match your page) --------
  _widgets(role) {
    const map = {
      reviewer:    { pos: ReviewerPositionInput,  date: ReviewerDateInput,  cmt: EvidenceReviewerComment },
      approver:    { pos: ApproverPositionInput,  date: ApproverDateInput,  cmt: EvidenceApproverComment },
      assigned_to: { pos: AssignedPositionInput,  date: AssignedDateInput,  cmt: AssignedToComment },
      attention_to:{ pos: AttentionPositionInput, date: AttentionDateInput, cmt: AttentionComment }
    };
    return map[role];
  },

  // Keep only the position text (strip "Name - " or "Name – ")
  cleanPosition(v) {
    if (v == null) return "";
    const s = String(v).replace(/\s*\n+\s*/g, " ").trim();
    const cut = Math.max(s.lastIndexOf(" - "), s.lastIndexOf(" – "));
    return cut > -1 ? s.slice(cut + 3).trim() : s;
  },

  // -------- Actions --------
  async approve(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    const h = this.header();

    const nameByRole = {
      reviewer: h.reviewer_name,
      approver: h.approver_name,
      assigned_to: h.assigned_to_name,
      attention_to: h.attention_to_name
    };
    const idByRole = {
      reviewer: h.reviewer_user_id,
      approver: h.approver_user_id,
      assigned_to: h.assigned_to_user_id,
      attention_to: h.attention_to_user_id
    };

    const w = this._widgets(role);
    if (!w) { showAlert(`Unknown role: ${role}`, "error"); return; }

    // Prefer typed position; fallback to mapped position from Users
    const mappedPos = UserLookup.position(idByRole[role]);
    const rawPos    = (w.pos.text || mappedPos || "");
    const position  = this.cleanPosition(rawPos);
    if (!position) { showAlert("Position is required.", "error"); return; }

    const action_date =
      w.date?.formattedDate || w.date?.inputText || moment().format("YYYY-MM-DD");

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      required_user_id:   idByRole[role]   || "",
      required_user_name: nameByRole[role] || "",
      name:               nameByRole[role] || "",
      position,                    // position-only
      action_date,
      decision: "Approved",
      comment: "",
      approved_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at: "",
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });

    await Approvals_GetByForm.run();
    showAlert("Approved.", "success");
  },

  async comment(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    const h = this.header();

    const nameByRole = {
      reviewer: h.reviewer_name,
      approver: h.approver_name,
      assigned_to: h.assigned_to_name,
      attention_to: h.attention_to_name
    };
    const idByRole = {
      reviewer: h.reviewer_user_id,
      approver: h.approver_user_id,
      assigned_to: h.assigned_to_user_id,
      attention_to: h.attention_to_user_id
    };

    const w = this._widgets(role);
    if (!w) { showAlert(`Unknown role: ${role}`, "error"); return; }

    const comment = (w.cmt.text || "").trim();
    if (!comment) { showAlert("Please enter a comment.", "warning"); return; }

    // Position for comment rows too (position-only)
    const mappedPos = UserLookup.position(idByRole[role]);
    const rawPos    = (w.pos?.text || mappedPos || "");
    const position  = this.cleanPosition(rawPos);

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      required_user_id:   idByRole[role]   || "",
      required_user_name: nameByRole[role] || "",
      name:               nameByRole[role] || "",
      position,                    // position-only
      action_date: "",
      decision: "Not Approved",
      comment,
      approved_at:  "",
      commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });

    await Approvals_GetByForm.run();
    showAlert("Comment submitted.", "success");
  }
};
