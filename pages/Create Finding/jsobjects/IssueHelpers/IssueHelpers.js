export default {
  pad2(n){ return String(n).padStart(2,'0'); },

  nextFormId(forms){
    const nums = (forms || [])
      .map(r => (`${r.form_id || ''}`).match(/F?(\d+)/i)?.[1])
      .filter(Boolean)
      .map(n => parseInt(n,10));
    const max = nums.length ? Math.max(...nums) : 7003; // first is F7004
    return `F${max + 1}`;
  },

  nextObservationCode(forms){
    const year = moment().format('YYYY');                // OBS-<year>-NN
    const prefix = `OBS-${year}-`;
    const suffixes = (forms || [])
      .map(r => r.observation_code_pdf || r.observation_code)
      .filter(x => (x || '').startsWith(prefix))
      .map(x => parseInt(String(x).split('-').pop(),10))
      .filter(n => !isNaN(n));
    const next = (suffixes.length ? Math.max(...suffixes) : 7) + 1;  // …-08 if none
    return `${prefix}${this.pad2(next)}`;
  },

  // 3 digits + 1 letter, unique vs existing
  newObservationNo(forms){
    const existing = new Set(
      (forms || [])
        .map(r => String(r.observation_no || r.observation_no_ui || '').trim())
        .filter(Boolean)
    );
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code, guard = 0;
    do {
      const num = Math.floor(100 + Math.random()*900);
      const letter = abc[Math.floor(Math.random()*26)];
      code = `${num}${letter}`;
      guard++;
    } while(existing.has(code) && guard < 2000);
    return code;
  },

  selectedUserFrom(widget){
    const id   = widget?.selectedOptionValue || "";
    const name = widget?.selectedOptionLabel || widget?.text || "";
    return { id, name };
  },

  sourcesCsv(){
    const opts = SourceSelect?.selectedOptions || [];
    if (Array.isArray(opts) && opts.length) return opts.map(o => o.label ?? o).join(', ');
    const labs = SourceSelect?.selectedOptionLabels;
    if (Array.isArray(labs) && labs.length) return labs.join(', ');
    const val = SourceSelect?.selectedOptionValue;
    if (Array.isArray(val)) return val.join(', ');
    return "";
  },

  // legacy alias used elsewhere
  genObsNo(){
    const forms = ObservationForms_GetAll?.data || [];
    return this.newObservationNo(forms);
  }
};
