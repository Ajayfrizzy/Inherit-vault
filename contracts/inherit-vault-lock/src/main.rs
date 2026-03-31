#![no_std]
#![cfg_attr(not(test), no_main)]

#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

use core::{convert::TryInto};

use ckb_std::{
    ckb_constants::Source,
    debug,
    high_level::{load_cell_data, load_input_since, QueryIter},
};

const VAULT_DATA_MIN_LEN: usize = 24; // Molecule table header size

pub fn program_entry() -> i8 {
    // -------------------------------------------------------------------------
    // InheritVault - Lock Script
    //
    // This script enforces the timelock condition explicitly.
    // When a beneficiary attempts to spend the Vault (used as an input),
    // this script verifies that the transaction's `since` field is >=
    // the unlock condition encoded in the cell's `output_data`.
    // -------------------------------------------------------------------------

    let mut found_inputs = false;

    // Verify all inputs in this transaction that use this Lock Script.
    for (i, since) in QueryIter::new(load_input_since, Source::GroupInput).enumerate() {
        found_inputs = true;

        let data = match load_cell_data(i, Source::GroupInput) {
            Ok(d) => d,
            Err(_) => return -1,
        };

        if data.len() < VAULT_DATA_MIN_LEN {
            debug!("Vault cell data too short to be valid Molecule table");
            return -2;
        }

        // Decode Molecule VaultCellData table offsets
        // unlock_type offset is stored at byte 12
        // unlock_value offset is stored at byte 16
        let o_unlock_type = u32::from_le_bytes(data[12..16].try_into().unwrap()) as usize;
        let o_unlock_value = u32::from_le_bytes(data[16..20].try_into().unwrap()) as usize;

        if data.len() < o_unlock_value + 8 {
            return -3; // Bounds error
        }

        let unlock_type = data[o_unlock_type];

        let mut uv_bytes = [0u8; 8];
        uv_bytes.copy_from_slice(&data[o_unlock_value..o_unlock_value + 8]);
        let unlock_value = u64::from_le_bytes(uv_bytes);

        // Verify `since` metric
        // CKB Since: absolute/relative flag is bit 63. Metric type is bits 61..62.
        let is_absolute = (since >> 63) == 0;
        let is_timestamp = ((since >> 61) & 0b11) == 0b01;
        let cell_is_timestamp = unlock_type == 1;

        if !is_absolute {
            debug!("Error: Transaction since field must be absolute.");
            return -4;
        }

        if is_timestamp != cell_is_timestamp {
            debug!("Error: Mismatch between cell timelock metric and transaction since metric.");
            return -5;
        }

        let since_value = since & 0x00FF_FFFF_FFFF_FFFF; // Extract 56-bit value

        if since_value < unlock_value {
            debug!(
                "Timelock enforced: Transaction since {} < Vault unlock value {}",
                since_value,
                unlock_value
            );
            return -6;
        }
    }

    if !found_inputs {
        // If there are no inputs (e.g. minting), a lock script generally accepts.
        return 0;
    }

    // NOTE: In a full production contract, after verifying the timelock here,
    // we would use `ckb_std::high_level::exec_cell` to execute the system
    // secp256k1 script to authenticate the beneficiary's signature from the args.
    // For this demonstration, we focus explicitly on the `since` timelock logic.

    0
}