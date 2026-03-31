const fs = require('fs');

// Fix config.ts
let cfg = fs.readFileSync('src/config.ts', 'utf8');
const badTextStart = cfg.indexOf('};e x p o r t');
if (badTextStart !== -1) {
    cfg = cfg.substring(0, badTextStart + 2) + "\n\n// Deployment hashes for our custom Rust CKB scripts\nexport const VAULT_LOCK_SCRIPT = {\n  codeHash: \"0x0000000000000000000000000000000000000000000000000000000000000000\",\n  hashType: \"type\" as const,\n};\n\nexport const VAULT_TYPE_SCRIPT = {\n  codeHash: \"0x0000000000000000000000000000000000000000000000000000000000000000\",\n  hashType: \"type\" as const,\n};\n";
    fs.writeFileSync('src/config.ts', cfg);
}

// Fix ccc.ts
let ccc = fs.readFileSync('src/lib/ccc.ts', 'utf8');
ccc = ccc.replace('import type { Network } from "../config";', 'import type { Network } from "../config";\nimport { getIndexerUrls, VAULT_LOCK_SCRIPT, VAULT_TYPE_SCRIPT } from "../config";');
ccc = ccc.replace(
    'lock: beneficiaryLock,\n          capacity: ccc.fixedPointFrom(amountCKB),\n        },',
    'lock: { codeHash: VAULT_LOCK_SCRIPT.codeHash, hashType: VAULT_LOCK_SCRIPT.hashType, args: beneficiaryLock.args },\n          type: { codeHash: VAULT_TYPE_SCRIPT.codeHash, hashType: VAULT_TYPE_SCRIPT.hashType, args: "0x" },\n          capacity: ccc.fixedPointFrom(amountCKB),\n        },'
);
fs.writeFileSync('src/lib/ccc.ts', ccc);

// Fix vaultIndexer.ts 
let idx = fs.readFileSync('src/lib/vaultIndexer.ts', 'utf8');
idx = idx.replace('import { getIndexerUrls, type Network } from "../config";', 'import { getIndexerUrls, type Network, VAULT_TYPE_SCRIPT } from "../config";');
// Update the indexer search string to search by type script instead of output data filtering prefix
const searchStr = `    const searchKey: Record<string, unknown> = {
      script: {
        code_hash: lockScript.code_hash,
        hash_type: lockScript.hash_type,
        args: lockScript.args,
      },
      script_type: "lock",
      with_data: true,
    };

    if (usePrefixFilter) {
      searchKey.filter = {
        output_data: VAULT_DATA_PREFIX,
        output_data_filter_mode: "prefix",
      };
    }`;
const targetStr = `    // With Custom Type Scripts, we query by the Vault Type Script 
    // instead of scanning all cells locked to the user and manually filtering by prefix.
    const searchKey: Record<string, unknown> = {
      script: {
        code_hash: VAULT_TYPE_SCRIPT.codeHash,
        hash_type: VAULT_TYPE_SCRIPT.hashType,
        args: "0x",
      },
      script_type: "type",
      with_data: true,
      filter: {
        script: {
          code_hash: lockScript.code_hash,
          hash_type: lockScript.hash_type,
          args: lockScript.args,
        }
      }
    };`;
idx = idx.replace(searchStr, targetStr);
fs.writeFileSync('src/lib/vaultIndexer.ts', idx);

console.log('Fixed successfully');
