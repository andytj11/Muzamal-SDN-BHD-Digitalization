export default {
  _hex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  },
  makeSalt(bytes = 16) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a)); // base64 string
  },
  async sha256SaltedHex(salt_b64, password) {
    const salt = Uint8Array.from(atob(String(salt_b64 || "")), c => c.charCodeAt(0));
    const pw   = new TextEncoder().encode(String(password || ""));
    const data = new Uint8Array(salt.length + pw.length);
    data.set(salt, 0); data.set(pw, salt.length);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return this._hex(digest);
  },
  async check(userId, plaintext) {
    await Auth_GetByUser.run({ user_id: userId });
    const row = (Auth_GetByUser.data || [])[0];
    if (!row) return { ok:false, reason:"No auth row" };
    const expected = String(row.password_hash_hex || "").toLowerCase();
    const got = (await this.sha256SaltedHex(row.salt_b64, plaintext)).toLowerCase();
    return { ok: got === expected, expected, computed: got, salt_b64: row.salt_b64 };
  }
};
