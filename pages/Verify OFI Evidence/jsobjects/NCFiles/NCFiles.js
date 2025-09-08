export default {
  lastNameFor(fid) {
    const map = appsmith.store.NC_LAST_UPLOADS || {};
    return (map && map[fid]) || appsmith.store.NC_LAST_FILE_NAME || "";
  },

  async openLastFor(fid) {
    const name = this.lastNameFor(fid);
    if (!name) throw new Error("No recent upload found for this form.");
    const url = await NCViewer.view(fid, name);   // creates blob: URL & stores NC_EVIDENCE_URL
    return url;
  }
};
