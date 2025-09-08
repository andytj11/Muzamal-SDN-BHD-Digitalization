export default {
  async run() {
    try {
      // Refresh to avoid computing with stale data
      await ObservationForms_GetAll.run();
      const forms = ObservationForms_GetAll.data || [];

      // Generate ONE TIME ONLY (re-use draft if set)
      const form_id              = IssueHelpers.nextFormId(forms);
      let   observation_no       = appsmith.store.draft_observation_no || "";
      if (!observation_no || (forms || []).some(r => String(r.observation_no) === observation_no)) {
        observation_no = IssueHelpers.newObservationNo(forms);
      }
      const observation_code_pdf = IssueHelpers.nextObservationCode(forms);

      // Dates
      const submitted        = moment().format('YYYY-MM-DD');
      const date_of_findings = submitted;
      const due              = Utils.addWorkingDays(submitted, 7, Holidays_GetAll.data);
      const plan_reply_due_date = moment(due).format('YYYY-MM-DD');

      // People
      const issued    = IssueHelpers.selectedUserFrom(IssuedBySelect);
      const reviewer  = IssueHelpers.selectedUserFrom(ReviewedBySelect);
      const approver  = IssueHelpers.selectedUserFrom(ApprovedBySelect);
      const assigned  = IssueHelpers.selectedUserFrom(AssignedToSelect);
      const attention = IssueHelpers.selectedUserFrom(AttentionToSelect);

      // Final snapshot (single source of truth)
      const payload = {
        form_id,
        observation_no,
        observation_code_pdf,
        document_no: "MUZ-FM-AUD-002",
        revision: 6,
        effective_date: "2024-11-26",

        date_of_findings,
        date_submitted: submitted,
        plan_reply_due_date,

        department_name: (DepartmentSelect.selectedOptionLabel || DepartmentSelect.text || ""),
        observation_source: IssueHelpers.sourcesCsv(),

        issued_by_user_id: issued.id,
        issued_by_name: issued.name,

        reviewer_user_id: reviewer.id,
        reviewer_name: reviewer.name,

        approver_user_id: approver.id,
        approver_name: approver.name,

        assigned_to_user_id: assigned.id,
        assigned_to_name: assigned.name,

        attention_to_user_id: attention.id,
        attention_to_name: attention.name,

        status: "OPEN",
        ofi_plan_received_date: "",
        ofi_evidence_received_date: "",
        findings_summary: (FindingsInput.text || "").trim()
      };

      await storeValue("form_payload", payload);

      // Insert the header (reads only from store.form_payload)
      await ObservationForms_InsertOne.run();

      // Seed approvals (same payload values)
      const seed = (role, req) => ({
        form_id,
        stage: "red",
        role,
        required_user_id: req.id,
        required_user_name: req.name,
        decision: "Pending",
        created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
        updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
      });

      await Promise.all([
        Approvals_InsertOne.run(seed("reviewer", reviewer)),
        Approvals_InsertOne.run(seed("approver", approver)),
        Approvals_InsertOne.run(seed("assigned_to", assigned)),
        Approvals_InsertOne.run(seed("attention_to", attention))
      ]);

      // Clear the draft so it can't leak into the next create
      await storeValue("draft_observation_no", null);

      // Refresh & notify
      await ObservationForms_GetAll.run();
      showAlert(`Issue ${form_id} created. Observation No: ${observation_no}`, "success");
    } catch (e) {
      showAlert(`Create failed: ${e.message || e}`, "error");
      throw e;
    }
  }
};
