export default {
  stage: "blue",

  // ---------- Header ----------
  header() {
    return ObservationForms_ByNo.data?.[0] || {};
  },
  getFormId() {
    return this.header().form_id || ObservationForms_ByNo.data?.[0]?.form_id || "";
  },

  // ---------- Users lookup ----------
  _userIx: null,
  _norm(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  },
  _buildUserIndex() {
    const ix = {};
    const users = Users_GetAll.data || [];

    users.forEach((u) => {
      const idVal = (u.id ?? u.user_id ?? "");
      const idKey = this._norm(idVal);
      if (idKey) ix["id:" + idKey] = u;

      const nameKey = this._norm(u.name);
      if (nameKey) ix["name:" + nameKey] = u;

      const emailKey = this._norm(u.email);
      if (emailKey) ix["email:" + emailKey] = u;
    });

    this._userIx = ix;
    return ix;
  },
  _getUserByIdOrName(userId, name) {
    const ix = this._userIx || this._buildUserIndex();

    // try id as-is
    const idKey = this._norm(userId);
    if (idKey && ix["id:" + idKey]) return ix["id:" + idKey];

    // try digits extracted from id-like strings (e.g., "u-prod-sup-05" -> "5")
    if (userId) {
      const digits = String(userId).match(/\d+/g);
      if (digits) {
        const compact = String(parseInt(digits.join(""), 10)); // "05" -> "5"
        if (ix["id:" + compact]) return ix["id:" + compact];
      }
    }

    // try name
    const nameKey = this._norm(name);
    if (nameKey && ix["name:" + nameKey]) return ix["name:" + nameKey];

    return {};
  },
  _positionFromUser(u) {
    return u.position || u.title || u.role || "";
  },
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

  // ---------- Approvals ----------
  allSignoffs() {
    return Approvals_GetByForm.data || [];
  },
  latest(stage, role) {
    const rows = this.allSignoffs().filter(
      (r) => (r.stage || "") === stage && (r.role || "") === role
    );
    if (!rows.length) return {};
    return _.maxBy(
      rows,
      (r) => moment(r.approved_at || r.commented_at || r.created_at).valueOf()
    ) || {};
  },

  // Acknowledgement (red)
  ackStatus(role) {
    const d = (this.latest("red", role).decision || "").toLowerCase();
    if (d === "approved") return "Approved";
    if (d === "not approved") return "Not Approved";
    return "Pending";
  },

  // Blue stage (superior/attention_to)
  latestBlueAttention() {
    return this.latest("blue", "attention_to");
  },
  isAttentionApproved() {
    return (this.latestBlueAttention().decision || "").toLowerCase() === "approved";
  },

  // ---------- Date helper ----------
  _dateFromPicker(p) {
    try {
      if (p?.formattedDate) return String(p.formattedDate).slice(0, 10);
      if (p?.selectedDate) return moment(p.selectedDate).format("YYYY-MM-DD");
    } catch (_) {}
    return "";
  },

  // ---------- Load ----------
  async load() {
    // Ensure users are loaded before we build the index
    await Users_GetAll.run();
    await ObservationForms_ByNo.run();

    const fid = this.getFormId();
    if (!fid) {
      showAlert("Observation number not found.", "warning");
      return;
    }

    // (Re)build index AFTER Users_GetAll has data
    this._buildUserIndex();

    await Approvals_GetByForm.run({ form_id: fid }); // red+blue
    await PlanReply_GetByForm.run(); // OFI plans
  },

  // ---------- Submit OFI plan (Assignee) -> planreply ----------
  async submitOFI() {
    const fid = this.getFormId();
    if (!fid) {
      showAlert("Load an Observation first.", "error");
      return;
    }

    const ofiText = (OFITextArea.text || "").trim();
    const target = this._dateFromPicker(TargetDateInput);

    if (!ofiText) {
      showAlert("Please enter Opportunities for Improvements.", "warning");
      return;
    }
    if (!target) {
      showAlert("Please select a target date.", "warning");
      return;
    }

    const h = this.header();
    const assigneeId = h.assigned_to_user_id || "";
    const assigneeName = h.assigned_to_name || "";
    const posOnly = this.assigneePosition();

    await PlanReply_InsertOne.run({
      form_id: fid,
      ofi_text: ofiText,
      target_date: target,
      reply_by_user_id: assigneeId,
      reply_by_name: assigneeName,
      reply_by_position: posOnly,
    });

    await PlanReply_GetByForm.run();
    showAlert("OFI plan submitted.", "success");
  },

  // ---------- Attention To APPROVE (blue) -> formsignedoff ----------
  async approveAttention() {
    const fid = this.getFormId();
    if (!fid) {
      showAlert("Load an Observation first.", "error");
      return;
    }

    const h = this.header();
    const attId = h.attention_to_user_id || "";
    const attName = h.attention_to_name || "";
    const pos = this.attentionPosition();

    if (!pos) {
      showAlert("Position is required for Attention To (check users table).", "error");
      return;
    }

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id: attId,
      required_user_name: attName,
      name: attName,
      position: pos,
      action_date: moment().format("YYYY-MM-DD"),
      decision: "Approved",
      comment: "",
      approved_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at: "",
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("OFI approved by Superior (Attention To).", "success");
  },

  // ---------- Attention To COMMENT (blue) -> formsignedoff ----------
  async commentAttention() {
    const fid = this.getFormId();
    if (!fid) {
      showAlert("Load an Observation first.", "error");
      return;
    }

    const h = this.header();
    const attId = h.attention_to_user_id || "";
    const attName = h.attention_to_name || "";
    const pos = this.attentionPosition(); // optional for comment
    const comment = (AttentionComment.text || "").trim();

    if (!comment) {
      showAlert("Please enter a comment.", "warning");
      return;
    }

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id: attId,
      required_user_name: attName,
      name: attName,
      position: pos || "",
      action_date: "",
      decision: "Not Approved",
      comment,
      approved_at: "",
      commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("Comment submitted.", "success");
  },
};
