export default {
  /* =========================
   *  CONFIG
   * ========================= */
  stage: "red", // finding stage
  roles: ["reviewer", "approver", "assigned_to", "attention_to"],
  _lastRole: null, // tracked for Auth_GetByUser fallback if needed

  /* =========================
   *  HEADER (observationforms)
   * ========================= */
  header() { return ObservationForms_ByNo.data?.[0] || {}; },
  formId() { return this.header().form_id || ""; },

  /* =========================
   *  USERS LOOKUP (from users sheet)
   * ========================= */
  _userIx: null,
  _norm(s) { return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); },
  _buildUserIndex() {
    const ix = {};
    (Users_GetAll.data || []).forEach((u) => {
      const idRaw = String(u.id ?? u.user_id ?? "").trim();
      if (idRaw) {
        ix["id:" + idRaw] = u;
        const digits = idRaw.match(/\d+/g);
        if (digits) ix["id:" + String(parseInt(digits.join(""), 10))] = u; // "u-503" -> "503"
      }
      const nameK = this._norm(u.name);
      if (nameK) ix["name:" + nameK] = u;
      const mailK = this._norm(u.email);
      if (mailK) ix["email:" + mailK] = u;
    });
    this._userIx = ix;
    return ix;
  },
  _findUser(userId, name) {
    const ix = this._userIx || this._buildUserIndex();
    const idK = String(userId || "").trim();
    if (idK && ix["id:" + idK]) return ix["id:" + idK];

    if (idK) {
      const digits = idK.match(/\d+/g);
      if (digits) {
        const compact = String(parseInt(digits.join(""), 10));
        if (ix["id:" + compact]) return ix["id:" + compact];
      }
    }
    const nameK = this._norm(name);
    if (nameK && ix["name:" + nameK]) return ix["name:" + nameK];
    return {};
  },
  _pos(u) { return u.position || u.title || u.role || ""; },

  // Positions resolved from Users table
  reviewerPosition() {
    const h = this.header();
    return this._pos(this._findUser(h.reviewer_user_id, h.reviewer_name));
  },
  approverPosition() {
    const h = this.header();
    return this._pos(this._findUser(h.approver_user_id, h.approver_name));
  },
  assigneePosition() {
    const h = this.header();
    return this._pos(this._findUser(h.assigned_to_user_id, h.assigned_to_name));
  },
  attentionPosition() {
    const h = this.header();
    return this._pos(this._findUser(h.attention_to_user_id, h.attention_to_name));
  },

  /* =========================
   *  SIGNOFFS (formsignedoff)
   * ========================= */
  allSignoffs() { return Approvals_GetByForm.data || []; },
  latest(role) {
    const rows = this.allSignoffs().filter(
      (r) => (r.stage || "") === this.stage && (r.role || "") === role
    );
    if (!rows.length) return {};
    return _.maxBy(
      rows,
      (r) => moment(r.approved_at || r.commented_at || r.created_at).valueOf()
    ) || {};
  },
  isApproved(role) {
    return (this.latest(role).decision || "").toLowerCase() === "approved";
  },
  computedStatus() {
    return this.roles.every((r) => this.isApproved(r))
      ? "FINDING APPROVED"
      : "OPEN";
  },

  /* =========================
   *  PAGE LOAD / REFRESH
   * ========================= */
  async load() {
    await Users_GetAll.run();
    await ObservationForms_ByNo.run();
    if (!this.formId()) { showAlert("Observation number not found.", "warning"); return; }
    this._buildUserIndex();
    await Approvals_GetByForm.run(); // already scoped by form in your sheet query
  },

  /* =========================
   *  IDs per role + widgets map
   * ========================= */
  userIdByRole(role) {
    const h = this.header();
    if (role === "reviewer")     return h.reviewer_user_id;
    if (role === "approver")     return h.approver_user_id;
    if (role === "assigned_to")  return h.assigned_to_user_id;
    if (role === "attention_to") return h.attention_to_user_id;
    return "";
  },

  _widgets(role) {
    const map = {
      reviewer: {
        pos: ReviewerPositionInput,
        date: ReviewerDateInput,
        cmt:  ReviewedByComment,
        pwd:  ReviewerPwdInput,     // <-- add Password input
      },
      approver: {
        pos: ApproverPositionInput,
        date: ApproverDateInput,
        cmt:  ApprovedByComment,
        pwd:  ApproverPwdInput,     // <-- add Password input
      },
      assigned_to: {
        pos: AssignedPositionInput,
        date: AssignedDateInput,
        cmt:  AssignedToComment,
        pwd:  AssignedToPwdInput,   // <-- add Password input
      },
      attention_to: {
        pos: AttentionPositionInput,
        date: AttentionDateInput,
        cmt:  AttentionToComment,
        pwd:  AttentionToPwdInput,  // <-- add Password input
      },
    };
    return map[role];
  },

  // Keep only position (strip "Name - Position")
  cleanPosition(v) {
    if (v == null) return "";
    const s = String(v).replace(/\s*\n+\s*/g, " ").trim();
    const cut = Math.max(s.lastIndexOf(" - "), s.lastIndexOf(" – "));
    return cut > -1 ? s.slice(cut + 3).trim() : s;
  },

  /* =========================
   *  AUTH (plaintext)
   * ========================= */
  async requirePassword(role) {
    this._lastRole = role;
    const w = this._widgets(role);
    const entered = (w?.pwd?.text || "").trim();
    if (!entered) { showAlert("Please enter your password.", "warning"); return false; }

    const uid = this.userIdByRole(role);
    if (!uid) { showAlert("User id is missing for this role.", "error"); return false; }

    await Auth_GetByUser.run({ user_id: uid });
    const row = (Auth_GetByUser.data || [])[0];
    if (!row) { showAlert("No authentication record found.", "error"); return false; }

    const expected = String(row.password_plain || "");
    if (entered !== expected) {
      showAlert("Authentication failed. Check your password.", "error");
      return false;
    }

    // optional: clear password field after success
    try { w?.pwd?.setValue?.(""); } catch(e) {}
    return true;
  },

  /* =========================
   *  APPROVE / COMMENT (RED)
   * ========================= */
  async approve(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // auth
    if (!(await this.requirePassword(role))) return;

    const h = this.header();
    const nameByRole = {
      reviewer: h.reviewer_name,
      approver: h.approver_name,
      assigned_to: h.assigned_to_name,
      attention_to: h.attention_to_name,
    };
    const idByRole = {
      reviewer: h.reviewer_user_id,
      approver: h.approver_user_id,
      assigned_to: h.assigned_to_user_id,
      attention_to: h.attention_to_user_id,
    };

    const w = this._widgets(role);
    if (!w) { showAlert(`Unknown role: ${role}`, "error"); return; }

    // Position: typed value or looked up from users
    let posTyped = w.pos?.text ?? "";
    if (!posTyped) {
      const posMap = {
        reviewer: this.reviewerPosition(),
        approver: this.approverPosition(),
        assigned_to: this.assigneePosition(),
        attention_to: this.attentionPosition(),
      };
      posTyped = posMap[role] || "";
    }
    const position = this.cleanPosition(posTyped);
    if (!position) { showAlert("Position is required.", "error"); return; }

    const d = w.date?.formattedDate || w.date?.text || w.date?.inputText || "";
    const action_date = d ? String(d).slice(0, 10) : moment().format("YYYY-MM-DD");

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      required_user_id:   idByRole[role] || "",
      required_user_name: nameByRole[role] || "",
      name:               nameByRole[role] || "",
      position,
      action_date,
      decision: "Approved",
      comment: "",
      approved_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at: "",
      signed_by_user_id: appsmith.user.email,
      created_at:   moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:   moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run();
    showAlert(`${_.startCase(role)} approved.`, "success");
  },

  async comment(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // auth
    if (!(await this.requirePassword(role))) return;

    const h = this.header();
    const nameByRole = {
      reviewer: h.reviewer_name,
      approver: h.approver_name,
      assigned_to: h.assigned_to_name,
      attention_to: h.attention_to_name,
    };
    const idByRole = {
      reviewer: h.reviewer_user_id,
      approver: h.approver_user_id,
      assigned_to: h.assigned_to_user_id,
      attention_to: h.attention_to_user_id,
    };

    const w = this._widgets(role);
    if (!w) { showAlert(`Unknown role: ${role}`, "error"); return; }

    const comment = (w.cmt?.text || "").trim();
    if (!comment) { showAlert("Please enter a comment.", "warning"); return; }

    let posTyped = w.pos?.text ?? "";
    if (!posTyped) {
      const posMap = {
        reviewer: this.reviewerPosition(),
        approver: this.approverPosition(),
        assigned_to: this.assigneePosition(),
        attention_to: this.attentionPosition(),
      };
      posTyped = posMap[role] || "";
    }
    const position = this.cleanPosition(posTyped);

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      required_user_id:   idByRole[role] || "",
      required_user_name: nameByRole[role] || "",
      name:               nameByRole[role] || "",
      position,
      action_date: "",
      decision: "Not Approved",
      comment,
      approved_at:  "",
      commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at:   moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:   moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run();

    // Reset comment so default text (latest) shows next render
    if (w.cmt?.widgetName) resetWidget(w.cmt.widgetName, true);

    showAlert(`${_.startCase(role)} comment submitted.`, "success");
  },

  /* =========================
   *  LATEST COMMENT (DEFAULTS)
   * ========================= */
  _latestCommentRow(stage, role) {
    const rows = (Approvals_GetByForm.data || []).filter(
      (r) =>
        (r.stage || "") === stage &&
        (r.role || "") === role &&
        (r.comment || "").trim() !== ""
    );
    if (!rows.length) return {};
    return _.maxBy(rows, (r) =>
      moment(r.commented_at || r.created_at).valueOf()
    ) || {};
  },
  // Bind these to each TextArea "Default Text"
  redLatestComment(role) {
    return this._latestCommentRow("red", role).comment || "";
  },
  // (Optional) last commented time for display
  redLatestCommentDate(role, fmt = "YYYY-MM-DD HH:mm:ss") {
    const row = this._latestCommentRow("red", role);
    const m = moment(row.commented_at || row.created_at);
    return m.isValid() ? m.format(fmt) : "";
  },
};
