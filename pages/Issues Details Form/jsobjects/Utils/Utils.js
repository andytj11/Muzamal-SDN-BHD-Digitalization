export default {
  // Normalize to date-only
  toDateOnly(input) {
    if (!input) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (input instanceof Date) {
      return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    }
    if (typeof input === "number" && isFinite(input)) {
      const ms = Math.round((input - 25569) * 86400 * 1000); // Sheets serial
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    if (typeof input === "string") {
      const t = input.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        const [y, m, d] = t.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      const d2 = new Date(t);
      if (!isNaN(d2)) return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
    }
    throw new Error("Invalid date input: " + String(input));
  },

  toISODate(input) {
    const d = this.toDateOnly(input);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  todayISO() {
    return this.toISODate(new Date());
  },

  addWorkingDays(startDateInput, n, holidays = []) {
    const start = this.toDateOnly(startDateInput || new Date());
    const holiSet = new Set(
      (holidays || [])
        .map(h => h?.holiday_date ?? h)
        .map(v => { try { return this.toISODate(v); } catch(e) { return null; } })
        .filter(Boolean)
    );
    let d = new Date(start), added = 0;
    while (added < Number(n || 0)) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();      // 0=Sun..6=Sat
      const iso = this.toISODate(d);
      if (dow >= 1 && dow <= 5 && !holiSet.has(iso)) added++;
    }
    return this.toISODate(d);
  },

  rowIndexById(rows, idField, idValue) {
    const i = (rows || []).findIndex(r => String(r[idField]) === String(idValue));
    return i >= 0 ? i + 2 : null; // +2 because header row is 1
  }
}
