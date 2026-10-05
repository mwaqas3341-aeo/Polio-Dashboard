/* Shared validators (client side). The database enforces the same rules; these give instant feedback. */
const Validate = {
  /** Digits only -> XXXXX-XXXXXXX-X (partial input is formatted as far as it goes). */
  formatCnic(v) {
    const d = String(v ?? "").replace(/\D/g, "").slice(0, 13);
    if (d.length <= 5) return d;
    if (d.length <= 12) return d.slice(0, 5) + "-" + d.slice(5);
    return d.slice(0, 5) + "-" + d.slice(5, 12) + "-" + d.slice(12);
  },
  isCnic: (v) => /^\d{5}-\d{7}-\d$/.test(v || ""),

  /** Digits -> 03XX-XXXXXXX */
  formatMobile(v) {
    const d = String(v ?? "").replace(/\D/g, "").replace(/^92/, "0").slice(0, 11);
    return d.length <= 4 ? d : d.slice(0, 4) + "-" + d.slice(4);
  },
  isMobile: (v) => /^03\d{2}-\d{7}$/.test(v || ""),

  normalizeIban: (v) => String(v ?? "").replace(/\s/g, "").toUpperCase(),

  /** ISO 7064 mod-97 over the rearranged IBAN. */
  ibanChecksum(iban) {
    const s = iban.slice(4) + iban.slice(0, 4);
    let rem = 0;
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      rem = code >= 48 && code <= 57 ? (rem * 10 + (code - 48)) % 97 : (rem * 100 + (code - 55)) % 97;
    }
    return rem === 1;
  },

  /**
   * Returns the four distinct states the UI must show.
   * accountHolder is ALWAYS "not verified": no account-title verification service is connected.
   */
  iban(value, bank /* {code,name,iban_code}|null */) {
    const iban = Validate.normalizeIban(value);
    const out = { empty: !iban, format: false, length: false, checksum: false, bankCode: null, bank: "unknown", accountHolder: "not verified" };
    if (!iban) return out;
    out.length = iban.length === 24;
    out.format = /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban);
    if (out.format) {
      out.checksum = Validate.ibanChecksum(iban);
      out.bankCode = iban.slice(4, 8);
      if (bank && bank.iban_code) out.bank = bank.iban_code === out.bankCode ? "matched" : "mismatch";
      else if (bank) out.bank = "bank code not on file for selected bank";
    }
    return out;
  },
};

const WALLETS = [["easypaisa", "EasyPaisa"], ["jazzcash", "JazzCash"], ["other", "Other"]];
const DESIGNATIONS = { ucmo: "UCMO", aic: "Area Incharge", team_member: "Team Member", driver: "Driver" };
const STATUS_LABEL = { active: "Active", left_campaign: "Left campaign", replaced: "Replaced", transferred: "Transferred", reserve: "Reserve", inactive: "Inactive" };
const TEAM_TYPES = [["fixed", "Fixed"], ["transit", "Transit"], ["mobile", "Mobile"]];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
