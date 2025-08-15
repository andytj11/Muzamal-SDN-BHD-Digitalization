export default {
  addWorkingDays(startISO, n, holidays = []) {
    const hs = new Set((holidays || []).map(h => (h.holiday_date || h).toString().slice(0,10)));
    let d = new Date(startISO), added = 0;
    while (added < n) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay(); // 0=Sun..6=Sat
      const iso = d.toISOString().slice(0,10);
      if (dow >= 1 && dow <= 5 && !hs.has(iso)) added++;
    }
    return d.toISOString().slice(0,10);
  },
  rowIndexById(rows, idField, idValue) {
    const i = (rows || []).findIndex(r => String(r[idField]) === String(idValue));
    return i >= 0 ? i + 2 : null; // +2 because header row is row 1
  }
}
