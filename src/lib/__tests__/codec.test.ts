import { describe, it, expect } from 'vitest';
import { encodeVaultCellData, decodeVaultCellData, type VaultCellPayload } from '../codec';

describe('Vault Codec Molecule Serialization', () => {

  it('should encode and decode correctly with standard values', () => {
    const payload: VaultCellPayload = {
      ownerAddress: "ckt1qre9u5z...", // Mock address
      ownerName: "Alice",
      unlock: { type: "timestamp", value: 1700000000 },
      memo: "For Bob"
    };

    const encoded = encodeVaultCellData(payload);
    expect(encoded.startsWith("0x")).toBe(true);

    const decoded = decodeVaultCellData(encoded);
    expect(decoded).toEqual(payload);
  });

  it('should encode and decode correctly with optional fields missing', () => {
    const payload: VaultCellPayload = {
      ownerAddress: "ckt1qre9u5z...",
      unlock: { type: "blockHeight", value: 50000 }
    };

    const encoded = encodeVaultCellData(payload);
    const decoded = decodeVaultCellData(encoded);
    
    expect(decoded?.ownerAddress).toBe(payload.ownerAddress);
    expect(decoded?.ownerName).toBeUndefined(); // Was optional/empty
    expect(decoded?.memo).toBeUndefined();
    expect(decoded?.unlock.type).toBe("blockHeight");
    expect(decoded?.unlock.value).toBe(50000);
  });

  it('should fail on malformed payload gracefully', () => {
    expect(decodeVaultCellData("0x1234")).toBeNull(); // Missing complete header
    
    // Valid 24 byte header but invalid structure internally
    const emptyBuff = new Uint8Array(24);
    // Setting an explicitly huge totalSize but passing emptyBuff
    new DataView(emptyBuff.buffer).setUint32(0, 99999, true); 
    let hex = "0x";
    for(let i=0; i<emptyBuff.length; i++) hex += emptyBuff[i].toString(16).padStart(2, "0");
    
    expect(decodeVaultCellData(hex)).toBeNull(); 
  });

});
