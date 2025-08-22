export default {
  stage: "red", // this page is the first approval gate

  header() {
    return ObservationForms_ByNo.data?.[0] || {};
  },

  formId() {
    return this.header().form_id || "";
  },

  signoffs() {
    return Approvals_GetByForm.data || [];
  },

  getSignoff(role) {
    return _.find(this.signoffs(), s => s.stage === this.stage && s.role === role) || {};
  },

  isApproved(role) {
    return this.getSignoff(role).decision === "Approved";
  },

  // load sequence when user types/enters the observation no
  async load() {
    await ObservationForms_ByNo.run();
    const fid = this.formId();
    if (!fid) { showAlert("Observation number not found.", "warning"); return; }
    await Approvals_GetByForm.run({ form_id: fid });
    // If your earliest records were created before we seeded 'red', you can auto-seed here.
  },

  // -----------------------------
  // Actions
  // -----------------------------
  async approve(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // name comes from header (paper form shows 'Name' per role)
    const h = this.header();
    const role2name = {
      reviewer: h.reviewer_name,
      approver: h.approver_name,
      assigned_to: h.assigned_to_name,
      attention_to: h.attention_to_name,
    };

    // Map your widget IDs for inputs on this page
    const map = {
      reviewer:    { pos: ReviewerPositionInput, date: ReviewerDateInput },
      approver:    { pos: ApproverPositionInput,  date: ApproverDateInput },
      assigned_to: { pos: AssignedPositionInput,  date: AssignedDateInput },
      attention_to:{ pos: AttentionPositionInput, date: AttentionDateInput },
    };

    const w = map[role];
    const position = (w.pos.text || "").trim();
    const action_date = w.date?.formattedDate || w.date?.inputText || moment().format("YYYY-MM-DD HH:mm");

    if (!position)   { showAlert("Position is required.", "error"); return; }
    if (!action_date){ showAlert("Date is required.", "error"); return; }

    await Approvals_UpdateOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      name: role2name[role] || "",
      position,
      action_date,
      decision: "Approved",
      approved_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("Approved.", "success");
  },

  async comment(role) {
    const fid = this.formId();
    if (!fid) { showAlert("Load an Observation first.", "error"); return; }

    // Map comment inputs
    const cmap = {
      reviewer:    ReviewedByComment,
      approver:    ApprovedByComment,
      assigned_to: AssignedToComment,
      attention_to:AttentionToComment
    };

    const comment = (cmap[role].text || "").trim();
    if (!comment) { showAlert("Please enter a comment.", "warning"); return; }

    await Approvals_UpdateOne.run({
      form_id: fid,
      stage: this.stage,
      role,
      comment,
      decision: "Not Approved",
      commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email
    });

    await Approvals_GetByForm.run({ form_id: fid });
    showAlert("Comment submitted.", "success");
  }
};
