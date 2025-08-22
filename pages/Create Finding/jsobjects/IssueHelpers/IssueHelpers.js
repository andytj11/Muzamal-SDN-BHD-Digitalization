export default {
  pad2(n){ return String(n).padStart(2,'0'); },

  nextFormId(forms){
    const nums = (forms || [])
      .map(r => (r.form_id || '').replace(/[^\d]/g,''))
      .filter(Boolean)
      .map(n => parseInt(n,10));
    const max = nums.length ? Math.max(...nums) : 7003; // so first is F7004
    return `F${max + 1}`;
  },

  nextObservationCode(forms){
    const year = moment().format('YYYY');                // OBS-<year>-NN
    const prefix = `OBS-${year}-`;
    const suffixes = (forms || [])
      .map(r => r.observation_code_pdf)
      .filter(x => (x || '').startsWith(prefix))
      .map(x => parseInt(x.split('-').pop(),10))
      .filter(n => !isNaN(n));
    const next = (suffixes.length ? Math.max(...suffixes) : 7) + 1;  // …-08 if none
    return `${prefix}${this.pad2(next)}`;
  },

  newObservationNo(forms){
    const existing = new Set((forms || []).map(r => r.observation_no));
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code, guard = 0;
    do {
      const num = Math.floor(100 + Math.random()*900);
      const letter = abc[Math.floor(Math.random()*26)];
      code = `${num}${letter}`;
      guard++;
    } while(existing.has(code) && guard < 1000);
    return code;
  },

  selectedUserFrom(widget){
    const id   = widget?.selectedOptionValue || "";
    const name = widget?.selectedOptionLabel || "";
    if (id && name) return { id, name };
    const u = (Users_GetAll?.data || []).find(x => x.user_id === id);
    return { id, name: name || u?.name || "" };
  },

  sourcesCsv(){
    const opts = SourceSelect?.selectedOptions || [];
    if (Array.isArray(opts) && opts.length) return opts.map(o => o.label ?? o).join(', ');
    const labs = SourceSelect?.selectedOptionLabels;
    if (Array.isArray(labs) && labs.length) return labs.join(', ');
    const val = SourceSelect?.selectedOptionValue;
    if (Array.isArray(val)) return val.join(', ');
    return "";
  }
};
