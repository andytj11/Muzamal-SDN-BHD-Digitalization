export default {
  pad2(n){ return String(n).padStart(2, '0'); },

  // ----- FORM ID (F####), strictly +1 from current max -----
  nextFormId(forms){
    const nums = (forms || [])
      .map(r => String(r.form_id || ""))
      .map(s => {
        const m = s.match(/\d+/);
        return m ? parseInt(m[0], 10) : NaN;
      })
      .filter(Number.isFinite);
    const max = nums.length ? Math.max(...nums) : 7003; // first becomes F7004
    return `F${max + 1}`;
  },
  // Guard against duplicate in memory (in case of stale cache)
  ensureUniqueFormId(forms, candidate){
    const have = new Set((forms || []).map(r => String(r.form_id || "").trim()));
    if (!have.has(candidate)) return candidate;
    let n = parseInt(candidate.replace(/[^\d]/g,''), 10);
    let id = candidate;
    while (have.has(id)) { n += 1; id = `F${n}`; }
    return id;
  },

  // ----- OBSERVATION CODE: OBS-YYYY-NN (per year, incremental) -----
  nextObservationCode(forms){
    const year = moment().format('YYYY');
    const prefix = `OBS-${year}-`;
    const suffixes = (forms || [])
      .map(r => String(r.observation_code_pdf || ""))
      .filter(x => x.startsWith(prefix))
      .map(x => parseInt(x.split('-').pop(), 10))
      .filter(n => !isNaN(n));
    const next = (suffixes.length ? Math.max(...suffixes) : 7) + 1; // …-08 if none
    return `${prefix}${this.pad2(next)}`;
  },

  // ----- OBSERVATION NO: 3 digits + 1 letter, unique within sheet -----
  newObservationNo(forms){
    const existing = new Set((forms || []).map(r => String(r.observation_no || "").trim()));
    const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < 2000; i++){
      const num = Math.floor(100 + Math.random()*900);
      const letter = ABC[Math.floor(Math.random()*26)];
      const code = `${num}${letter}`;
      if (!existing.has(code)) return code;
    }
    // ultra-rare fallback
    return `${moment().format("Hmm")}${ABC[Math.floor(Math.random()*26)]}`;
  },

  // ----- Pick user from Select widget -----
  selectedUserFrom(widget){
    const id   = widget?.selectedOptionValue || "";
    const name = widget?.selectedOptionLabel || "";
    if (id && name) return { id, name };
    const u = (Users_GetAll?.data || []).find(x => String(x.user_id) === String(id));
    return { id, name: name || u?.name || "" };
  },

  // ----- Sources → CSV -----
  sourcesCsv(){
    const opts = SourceSelect?.selectedOptions || [];
    if (Array.isArray(opts) && opts.length) return opts.map(o => o.label ?? o).join(', ');
    const labs = SourceSelect?.selectedOptionLabels;
    if (Array.isArray(labs) && labs.length) return labs.join(', ');
    const val = SourceSelect?.selectedOptionValue;
    if (Array.isArray(val)) return val.join(', ');
    return "";
  },

  // ----- Build the exact row we will insert (single source of truth) -----
  buildInsertRow(){
    const forms = ObservationForms_GetAll.data || [];

    // IDs (use store if already reserved)
    const reserved = appsmith.store.new_form_id;
    const formId = this.ensureUniqueFormId(forms,
      reserved || this.nextFormId(forms)
    );
    const obsNo   = appsmith.store.new_obs_no   || this.newObservationNo(forms);
    const obsCode = appsmith.store.new_obs_code || this.nextObservationCode(forms);

    // Dates
    const submitted = moment().format('YYYY-MM-DD');
    const findings  = submitted;
    const due = Utils.addWorkingDays(submitted, 7, Holidays_GetAll.data);
    const dueFmt = moment(due).format('YYYY-MM-DD');

    // Pickers
    const deptName  = DepartmentSelect.selectedOptionLabel || DepartmentSelect.text || "";
    const sourceCsv = this.sourcesCsv();

    const issued    = this.selectedUserFrom(IssuedBySelect);
    const reviewer  = this.selectedUserFrom(ReviewedBySelect);
    const approver  = this.selectedUserFrom(ApprovedBySelect);
    const assigned  = this.selectedUserFrom(AssignedToSelect);
    const attention = this.selectedUserFrom(AttentionToSelect);

    return {
      // --- IDs ---
      form_id: formId,
      observation_no: obsNo,                 // << write the *real* obs no here
      observation_code_pdf: obsCode,         // OBS-YYYY-NN

      // --- static doc info ---
      document_no: "MUZ-FM-AUD-002",
      revision: 6,
      effective_date: "2024-11-26",

      // --- dates ---
      date_of_findings: findings,            // == date_submitted
      date_submitted: submitted,
      plan_reply_due_date: dueFmt,

      // --- meta / pickers ---
      department_name: deptName,
      observation_source: sourceCsv,

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

      // --- status & remarks ---
      status: "OPEN",
      ofi_plan_received_date: "",
      ofi_evidence_received_date: "",
      findings_summary: (FindingsInput.text || "").trim()
    };
  }
};
