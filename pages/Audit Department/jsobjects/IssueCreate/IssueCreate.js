export default {
  async run(){
    const { formId, obsCode } = await IssueHelpers.reserveIds();
    await storeValue('form_id', formId);
    await storeValue('observation_code_pdf', obsCode);

    // derive "date_submitted" as today
    const submitted = moment().format('YYYY-MM-DD');
    await storeValue('date_submitted', submitted);

    // compute 7-day calendar + 7 working-day due dates
    const { cal, work } = IssueHelpers.computeDueDates(submitted);
    await storeValue('due_cal', cal);
    await storeValue('due_work', work);

    if (EvidenceUpload.files?.length) {
			await Evidence_Upload.run();
			if (!Evidence_Upload.data?.ok) {
				showAlert("Upload failed: " + (Evidence_Upload.data?.message || "Unknown"), "error");
				return;
			}
			await storeValue("evidence_url", Evidence_Upload.data.link);
		}

    await ObservationForms_Insert.run();
    await FormFindings_Insert.run();
    if (EvidenceUpload.files?.length) await Evidence_Insert.run();

    showAlert(`Issue ${formId} created. Plan reply due (working): ${work}`, "success");
  }
}
