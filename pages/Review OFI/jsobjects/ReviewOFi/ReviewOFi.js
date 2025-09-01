export default {
  stage: "blue",

  /* ---------- Header ---------- */
  header() { return ObservationForms_ByNo.data?.[0] || {}; },
  getFormId() { return this.header().form_id || ObservationForms_ByNo.data?.[0]?.form_id || ""; },

  /* ---------- Users lookup ---------- */
  _userIx: null,
  _norm(s) { return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); },

  _buildUserIndex() {
    const ix = {};
    const users = Users_GetAll.data || [];
    users.forEach(u => {
      const idVal = (u.id ?? u.user_id ?? "");
      const idKey = this._norm(idVal);
      if (idKey) ix["id:"+idKey] = u;

      const nameKey  = this._norm(u.name);
      const emailKey = this._norm(u.email);
      if (nameKey)  ix["name:"+nameKey]  = u;
      if (emailKey) ix["email:"+emailKey] = u;
    });
    this._userIx = ix;
    return ix;
  },

  _getUserByIdOrName(userId, name) {
    const ix = this._userIx || this._buildUserIndex();

    // try id as-is
    const idKey = this._norm(userId);
    if (idKey && ix["id:"+idKey]) return ix["id:"+idKey];

    // try digits extracted from id-like strings (e.g., "u-prod-sup-05" -> "5")
    if (userId) {
      const digits = String(userId).match(/\d+/g);
      if (digits) {
        const compact = String(parseInt(digits.join(""), 10));
        if (ix["id:"+compact]) return ix["id:"+compact];
      }
    }

    // try name
    const nameKey = this._norm(name);
    if (nameKey && ix["name:"+nameKey]) return ix["name:"+nameKey];

    return {};
  },

  _positionFromUser(u) { return u.position || u.title || u.role || ""; },

  assigneePosition() {
    const h = this.header();
    const u = this._getUserByIdOrName(h.assigned_to_user_id, h.assigned_to_name);
    return this._positionFromUser(u);
  },

  attentionPosition() {
    const h = this.header();
    const u = this._getUserByIdOrName(h.attention_to_user_id, h.attention_to_name);
    return this._positionFromUser(u);
  },

  /* ---------- Authentication (plain text via Auth_GetByUser) ---------- */
  _enteredPassword() {
    return (typeof AttentionPassword !== "undefined" ? (AttentionPassword.text || "") : "").trim();
  },

  async _requireAuthForAttention() {
    const h   = this.header();
    const uid = h.attention_to_user_id || "";
    const pw  = this._enteredPassword();

    if (!pw) { showAlert("Please enter your password.", "warning"); return false; }

    // Query your auth sheet for this user id
    try { await Auth_GetByUser.run({ user_id: uid }); } catch(_) {}
    const row = (Auth_GetByUser.data && Auth_GetByUser.data[0]) || {};
    const ok  = pw === (row.password_plain || "");

    if (!ok) { showAlert("Authentication failed. Please check your password.", "error"); return false; }

    // Clear password field after successful check
    try { if (AttentionPassword?.widgetName) resetWidget(AttentionPassword.widgetName, true); } catch(_) {}
    return true;
  },

  /* ---------- Approvals & helpers ---------- */
  allSignoffs() { return Approvals_GetByForm.data || []; },
  latest(stage, role) {
    const rows = this.allSignoffs().filter(r => (r.stage || "") === stage && (r.role || "") === role);
    if (!rows.length) return {};
    return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
  },

  ackStatus(role) {
    const d = (this.latest("red", role).decision || "").toLowerCase();
    if (d === "approved") return "Approved";
    if (d === "not approved") return "Not Approved";
    return "Pending";
  },

  latestBlueAttention() { return this.latest("blue", "attention_to"); },
  isAttentionApproved() { return (this.latestBlueAttention().decision || "").toLowerCase() === "approved"; },

  /* ---------- Date helper ---------- */
  _dateFromPicker(p) {
    try {
      if (p?.formattedDate) return String(p.formattedDate).slice(0, 10);
      if (p?.selectedDate)  return moment(p.selectedDate).format("YYYY-MM-DD");
    } catch(_) {}
    return "";
  },

  /* ---------- Load ---------- */
  async load() {
    await Users_GetAll.run();
    await ObservationForms_ByNo.run();

    const fid = this.getFormId();
    if (!fid) { showAlert("Observation number not found.", "warning"); return; }

    this._buildUserIndex();

    await Approvals_GetByForm.run({ form_id: fid }); // red+blue
    await PlanReply_GetByForm.run();                 // OFI plans
  },

  /* ---------- Submit OFI plan (Assignee) -> planreply ---------- */
  async submitOFI() {
    const fid = this.getFormId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    const ofiText = (OFITextArea.text || "").trim();
    const target  = this._dateFromPicker(TargetDateInput);
    if (!ofiText) { showAlert("Please enter Opportunities for Improvements.", "warning"); return; }
    if (!target)  { showAlert("Please select a target date.", "warning"); return; }

    const h = this.header();
    const assigneeId   = h.assigned_to_user_id || "";
    const assigneeName = h.assigned_to_name    || "";
    const posOnly      = this.assigneePosition();

    await PlanReply_InsertOne.run({
      form_id: fid,
      ofi_text: ofiText,
      target_date: target,
      reply_by_user_id: assigneeId,
      reply_by_name: assigneeName,
      reply_by_position: posOnly
    });

    await PlanReply_GetByForm.run();
    showAlert("OFI plan submitted.", "success");
  },

  /* ---------- BLUE: Approve (requires password) ---------- */
  async approveAttention() {
    const fid = this.getFormId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // 1) Password check
    const authed = await this._requireAuthForAttention();
    if (!authed) return;

    // 2) Insert approval
    const h = this.header();
    const attId   = h.attention_to_user_id || "";
    const attName = h.attention_to_name    || "";

    const pos = this.attentionPosition();
    if (!pos) { showAlert("Position is required for Attention To (check users table).", "error"); return; }

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id:   attId,
      required_user_name: attName,
      name:               attName,
      position:           pos,
      action_date:        moment().format("YYYY-MM-DD"),
      decision:           "Approved",
      comment:            "",
      approved_at:        moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at:       "",
      signed_by_user_id:  appsmith.user.email,
      created_at:         moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:         moment().format("YYYY-MM-DD HH:mm:ss")
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("OFI approved by Superior (Attention To).", "success");
  },

  /* ---------- BLUE: Comment (requires password) ---------- */
  async commentAttention() {
    const fid = this.getFormId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // 1) Password check
    const authed = await this._requireAuthForAttention();
    if (!authed) return;

    // 2) Validate comment & insert
    const comment = (AttentionComment.text || "").trim();
    if (!comment) { showAlert("Please enter a comment.", "warning"); return; }

    const h = this.header();
    const attId   = h.attention_to_user_id || "";
    const attName = h.attention_to_name    || "";
    const pos     = this.attentionPosition(); // optional for comment

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id:   attId,
      required_user_name: attName,
      name:               attName,
      position:           pos || "",
      action_date:        "",
      decision:           "Not Approved",
      comment,
      approved_at:        "",
      commented_at:       moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id:  appsmith.user.email,
      created_at:         moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:         moment().format("YYYY-MM-DD HH:mm:ss")
    });

    await Approvals_GetByForm.run({ form_id: fid });

    // reset inputs
    try {
      if (AttentionComment?.widgetName)   resetWidget(AttentionComment.widgetName, true);
      if (AttentionPassword?.widgetName)  resetWidget(AttentionPassword.widgetName, true);
    } catch(_) {}

    showAlert("Superior comment submitted.", "success");
  }
};
