export default {
  async run() {
    // 1) reserve a single form_id for this transaction
    const forms = ObservationForms_GetAll.data || [];
    const form_id = IssueHelpers.nextFormId(forms);
    await storeValue("new_form_id", form_id);

    // 2) insert header
    await ObservationForms_InsertOne.run();

    // 3) seed RED stage sign-offs (reviewer, approver, assigned_to, attention_to)
    const reviewer  = IssueHelpers.selectedUserFrom(ReviewedBySelect);
    const approver  = IssueHelpers.selectedUserFrom(ApprovedBySelect);
    const assigned  = IssueHelpers.selectedUserFrom(AssignedToSelect);
    const attention = IssueHelpers.selectedUserFrom(AttentionToSelect);

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

    // 4) refresh and clear reservation
    await ObservationForms_GetAll.run();
    await storeValue("new_form_id", null);

    showAlert("Issue created successfully.", "success");
  }
};
