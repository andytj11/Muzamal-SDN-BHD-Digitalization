export default {
  sheet(v, fmt = 'YYYY-MM-DD') {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string') {
      const m = moment(v, ['YYYY-MM-DD', 'YYYY/MM/DD', moment.ISO_8601], true);
      return m.isValid() ? m.format(fmt) : v;
    }
    if (typeof v === 'number') {
      // >1e12 => milliseconds; >1e9 => seconds; otherwise treat as Excel serial days
      if (v > 1e12) return moment(v).format(fmt);
      if (v > 1e9)  return moment.unix(v).format(fmt);
      const excelEpoch = moment('1899-12-30', 'YYYY-MM-DD'); // Excel epoch
      return excelEpoch.add(v, 'days').format(fmt);
    }
    return String(v);
  }
};
