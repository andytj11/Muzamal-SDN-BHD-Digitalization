export default {
  /* ----------------------- CONFIG / SEEDS ----------------------- */
  // Form IDs will be F7004, F7005, ...
  BASE_FORM_START: 7004,

  // Observation code starts by year.
  // For 2025 we start at 08 => OBS-2025-08 then -09, -10, ...
  // (Other years default to 01 unless you add them here.)
  BASE_CODE_START_BY_YEAR: { "2025": 8 },

  // Working due date rule: +N calendar days then roll to next business day
  CAL_DAYS: 30,

  /* ----------------------- INTERNAL HELPERS ----------------------- */
  _dateOfFindings() {
    // fallback to today if widget empty
    return (typeof moment !== "undefined")
      ? (DateOfFindings?.selectedDate ? moment(DateOfFindings.selectedDate) : moment())
      : new Date();
  },

  async _getForms() {
    try { await ObservationForms_GetAll.run(); } catch (e) {}
    return Array.isArray(ObservationForms_GetAll?.data) ? ObservationForms_GetAll.data : [];
  },

  /* ----------------------- ID GENERATORS ----------------------- */
  nextFormId(rows) {
    const nums = (rows || [])
      .map(r => String(r.form_id || "").match(/F(\d+)/i))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10))
      .filter(n => !isNaN(n));

    const seed = this.BASE_FORM_START - 1;
    const max = nums.length ? Math.max(...nums) : seed;
    const next = Math.max(max + 1, this.BASE_FORM_START);
    return `F${next}`;
  },

  nextObsCode(rows) {
    const year = this._dateOfFindings().format?.("YYYY") || new Date().getFullYear().toString();
    const prefix = `OBS-${year}-`;

    const suffixes = (rows || [])
      .map(r => String(r.observation_code_pdf || ""))
      .filter(code => code.startsWith(prefix))
      .map(code => parseInt(code.slice(prefix.length), 10))
      .filter(n => !isNaN(n));

    const baseStart = this.BASE_CODE_START_BY_YEAR[year] || 1; // default 01 for other years
    const seed = baseStart - 1;
    const max = suffixes.length ? Math.max(...suffixes) : seed;
    const next = Math.max(max + 1, baseStart);

    return `${prefix}${String(next).padStart(2, "0")}`;
  },

  ensureUnique(rows, formId, obsCode) {
    let f = formId;
    let c = obsCode;

    const hasForm = id =>
      (rows || []).some(r => String(r.form_id).toUpperCase() === String(id).toUpperCase());
    const hasCode = code =>
      (rows || []).some(r => String(r.observation_code_pdf) === String(code));

    // bump until not colliding
    while (hasForm(f)) {
      const n = parseInt(String(f).replace(/^\D+/, ""), 10) + 1;
      f = `F${n}`;
    }

    while (hasCode(c)) {
      const m = String(c).match(/^OBS-(\d{4})-(\d+)$/);
      const y = m ? m[1] : (this._dateOfFindings().format?.("YYYY") || new Date().getFullYear().toString());
      const s = (m ? parseInt(m[2], 10) : 0) + 1;
      c = `OBS-${y}-${String(s).padStart(2, "0")}`;
    }

    return { formId: f, obsCode: c };
  },
	
	// ---- Working-day adder (fallback if Utils isn't available) ----
  addWorkingDaysLocal(startDate, days, holidaysRows) {
    const m0 = (typeof moment !== "undefined")
      ? moment(startDate)
      : new Date(startDate);

    const toYMD = mm => (typeof moment !== "undefined"
      ? mm.format("YYYY-MM-DD")
      : new Date(mm).toISOString().slice(0,10));

    const holidaySet = new Set(
      (holidaysRows || []).map(h =>
        (h.holiday_date && typeof moment !== "undefined")
          ? moment(h.holiday_date).format("YYYY-MM-DD")
          : h.holiday_date
      )
    );

    // include the start day in the count, like your Utils.addWorkingDays
    let m = (typeof moment !== "undefined") ? m0.clone() : new Date(m0);
    let count = 0;
    while (count < days) {
      const d = (typeof moment !== "undefined") ? m.day() : m.getDay();
      const ymd = toYMD(m);
      const isWeekend = d === 0 || d === 6;
      const isHoliday = holidaySet.has(ymd);
      if (!isWeekend && !isHoliday) count++;
      if (count === days) break;
      (typeof moment !== "undefined") ? m.add(1, "day") : m.setDate(m.getDate()+1);
    }
    return toYMD(m);
  },

  /**
   * Compute plan-reply due dates from SUBMISSION date:
   * - Calendar due: +7 calendar days
   * - Working due:  +7 working days (weekends/holidays skipped)
   *
   * @param {string} submitYMD - e.g. "2025-08-19" (optional; defaults to today)
   */
  computeDueDates(submitYMD) {
    const submitted = (typeof moment !== "undefined")
      ? moment(submitYMD || moment().format("YYYY-MM-DD"))
      : new Date(submitYMD || new Date());

    const cal = (typeof moment !== "undefined")
      ? submitted.clone().add(7, "days").format("YYYY-MM-DD")
      : new Date(submitted.getTime() + 7*24*3600*1000).toISOString().slice(0,10);

    // Prefer your Utils.addWorkingDays if present
    const work = (typeof Utils !== "undefined" && typeof Utils.addWorkingDays === "function")
      ? Utils.addWorkingDays(
          (typeof moment !== "undefined" ? submitted.format("YYYY-MM-DD") : submitted.toISOString().slice(0,10)),
          7,
          Holidays_GetAll.data
        )
      : this.addWorkingDaysLocal(
          (typeof moment !== "undefined" ? submitted.format("YYYY-MM-DD") : submitted.toISOString().slice(0,10)),
          7,
          Holidays_GetAll.data
        );

    return { cal, work };
  },

  async reserveIds() {
    const rows = await this._getForms();
    let formId = this.nextFormId(rows);
    let obsCode = this.nextObsCode(rows);
    ({ formId, obsCode } = this.ensureUnique(rows, formId, obsCode));
    return { formId, obsCode };
  },

  genObsNo() {
    const n = Math.floor(100 + Math.random() * 900); // 3 digits
    const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 26));
    return `${n}${letter}`; // e.g., 861X
  },

  /* ----------------------- OPTIONAL: PREVIEW ----------------------- */
  async previewNext() {
    const rows = await this._getForms();
    return {
      nextForm: this.nextFormId(rows),
      nextCode: this.nextObsCode(rows),
    };
  }
};
