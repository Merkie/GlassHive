import Cryptr from "cryptr";

const masterKey = process.env.MASTER_ENCRYPTION_KEY;
if (!masterKey || masterKey.length < 16) {
  throw new Error("MASTER_ENCRYPTION_KEY environment variable is required (at least 16 chars)");
}

const cryptr = new Cryptr(masterKey);

export default cryptr;
