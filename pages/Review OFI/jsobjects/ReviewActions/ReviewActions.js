export default {
  /* =========================
   *  CONFIG (BLUE / attention_to)
   * ========================= */
  stage: "blue",
  role: "attention_to",

  /* =========================
   *  HEADER (observationforms)
   * ========================= */
  header() {
    return ObservationForms_ByNo.data?.[0] || {};
  },
  formId() {
    return this.header().form_id || "";
  },
	
	getFormId() {
    // primary: from header(); fallback: from URL query param
    const fid = String(
      this.header().form_id || appsmith.URL.queryParams.form_id || ""
    ).trim();
    return fid;
  },
  /* =========================
   *  UTILITIES
   * ========================= */
  _norm(s) { return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); },
  _same(a,b){ return this._norm(a) === this._norm(b); },

  /* =========================
   *  SIGNOFFS (formsignedoff)
   * ========================= */
  allSignoffs() { return Approvals_GetByForm.data || []; },

  latestBlue(role = this.role) {
    const rows = this.allSignoffs().filter(r => (r.stage||"")===this.stage && (r.role||"")===role);
    if (!rows.length) return {};
    return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
  },
  blueApproved() { return (this.latestBlue().decision || "").toLowerCase() === "approved"; },

  /* =========================
   *  COMMENTS (BLUE) – same style as your commentbox
   * ========================= */
  _latestCommentRow(stage, role) {
    const rows = (Approvals_GetByForm.data || []).filter(r =>
      (r.stage||"") === stage &&
      (r.role ||"") === role &&
      (r.comment||"").trim() !== ""
    );
    if (!rows.length) return {};
    return _.maxBy(rows, r => moment(r.commented_at || r.created_at).valueOf()) || {};
  },
  blueLatestComment() {
    const row = this._latestCommentRow("blue","attention_to");
    return (row && row.comment) ? row.comment : "";
  },

  /* =========================
   *  PLANREPLY (OFI) – latest row (mirror of comment logic)
   * ========================= */
  _planRowsRaw() {
    const d = PlanReply_GetByForm?.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  },
  _planRowsForForm() {
    const fid = this.formId();
    const all = this._planRowsRaw();
    if (!fid) return [];
    return all.filter(r => this._same(r.form_id, fid));
  },
  _planRowTimestamp(r) {
    // same priority idea, but for planreply rows
    const t = r.updated_at || r.created_at || r.reply_by_date || r.reply_date || r.target_date || "";
    const m = moment(t, ["YYYY-MM-DD HH:mm:ss","YYYY-MM-DD", moment.ISO_8601], true);
    return m.isValid() ? m.valueOf() : 0;
  },
  _latestOfiRow() {
    const rows = this._planRowsForForm();
    if (!rows.length) return {};
    return _.maxBy(rows, r => this._planRowTimestamp(r)) || {};
  },
  ofiLatestText() {
    const r = this._latestOfiRow();
    // accept either ofi_text (new) or reply_text (legacy)
    return (r.ofi_text ?? r.reply_text ?? "") || "";
  },
  ofiLatestTargetDate(fmt = "YYYY-MM-DD") {
    const r = this._latestOfiRow();
    const d = r.target_date || r.reply_date || r.reply_by_date || "";
    const m = moment(d, ["YYYY-MM-DD", moment.ISO_8601], true);
    return m.isValid() ? m.format(fmt) : (d || "");
  },

  /* =========================
   *  STATUS (blue > red)
   * ========================= */
  computedStatus() {
    const all = this.allSignoffs();
    const latest = (stage, role) => {
      const rows = all.filter(r => (r.stage||"")===stage && (r.role||"")===role);
      if (!rows.length) return {};
      return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
    };

    // Blue attention approved → OFI APPROVED
    const blueAtt = latest("blue","attention_to");
    if ((blueAtt.decision || "").toLowerCase() === "approved") return "OFI APPROVED";

    // Else if red all approved → FINDING APPROVED
    const redRoles = ["reviewer","approver","assigned_to","attention_to"];
    const redAllApproved = redRoles.every(r => (latest("red", r).decision || "").toLowerCase()==="approved");
    if (redAllApproved) return "FINDING APPROVED";

    return "OPEN";
  },

  /* =========================
   *  LOAD / REFRESH
   * ========================= */
  async load() {
    await ObservationForms_ByNo.run();
    const fid = this.formId();
    if (!fid) { showAlert("Observation number not found.","warning"); return; }

    // Pull the scoped datasets needed for comments + OFI
    await Approvals_GetByForm.run({ form_id: fid });
    await PlanReply_GetByForm.run({ form_id: fid });

    // If the OFI TextArea rendered before data arrived, force a re-eval once
    try {
      if (typeof OFITextArea?.widgetName === "string") resetWidget(OFITextArea.widgetName, true);
    } catch(e) {}
  },

  /* =========================
   *  ACTIONS (BLUE)
   * ========================= */
  async approveAttention() {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.","error"); return; }

    const h = this.header();
    // If you already have a position lookup, add it here; not required to return OFI text.
    const position = ""; // optional on your blue page if not needed

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id:   h.attention_to_user_id || "",
      required_user_name: h.attention_to_name    || "",
      name:               h.attention_to_name    || "",
      position,
      action_date: moment().format("YYYY-MM-DD"),
      decision: "Approved",
      comment: "",
      approved_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at: "",
      signed_by_user_id: appsmith.user.email,
      created_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("Superior approved the OFI.","success");
  },

  async commentAttention() {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.","error"); return; }

    const comment = (typeof AttentionComment !== "undefined" ? (AttentionComment.text || "") : "").trim();
    if (!comment) { showAlert("Please enter a comment.","warning"); return; }

    const h = this.header();

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "blue",
      role: "attention_to",
      required_user_id:   h.attention_to_user_id || "",
      required_user_name: h.attention_to_name    || "",
      name:               h.attention_to_name    || "",
      position: "",
      action_date: "",
      decision: "Not Approved",
      comment,
      approved_at:  "",
      commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:  moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    await Approvals_GetByForm.run({ form_id: fid });
    if (typeof AttentionComment?.widgetName === "string") resetWidget(AttentionComment.widgetName, true);
    showAlert("Superior comment submitted.","success");
  },
};
