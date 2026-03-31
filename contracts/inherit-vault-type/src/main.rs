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
    high_level::{load_cell_data, QueryIter},
};

const VAULT_DATA_MIN_LEN: usize = 24; // Molecule table header size

pub fn program_entry() -> i8 {
    // -------------------------------------------------------------------------
    // InheritVault - Type Script (Cell Integrity)
    //
    // This script enforces the data integrity of the cell.
    // It verifies that any cell created with this Type Script strictly
    // adheres to the `VaultCellData` Molecule serialization schema.
    // This prevents malicious actors from spamming fake IVLT cells.
    // -------------------------------------------------------------------------

    // Verify all outputs created in this transaction with this Type Script.
    for (i, data) in QueryIter::new(|i, s| load_cell_data(i, s), Source::GroupOutput).enumerate() {
        if data.len() < VAULT_DATA_MIN_LEN {
            debug!("Output {}: Cell data too short", i);
            return -7;
        }

        // Molecule structure checks
        let total_size = u32::from_le_bytes(data[0..4].try_into().unwrap()) as usize;
        if total_size != data.len() {
            debug!(
                "Output {}: Total size mismatch. Expected {}, found {}",
                i,
                data.len(),
                total_size
            );
            return -8;
        }

        let o_owner_address = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
        let o_owner_name = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
        let o_unlock_type = u32::from_le_bytes(data[12..16].try_into().unwrap()) as usize;
        let o_unlock_value = u32::from_le_bytes(data[16..20].try_into().unwrap()) as usize;
        let o_memo = u32::from_le_bytes(data[20..24].try_into().unwrap()) as usize;

        // Verify offset boundaries are strictly increasing and valid
        if o_owner_address != VAULT_DATA_MIN_LEN {
            return -9;
        }
        if o_owner_name < o_owner_address {
            return -10;
        }
        if o_unlock_type < o_owner_name {
            return -11;
        }
        if o_unlock_value < o_unlock_type {
            return -12;
        }
        if o_memo < o_unlock_value {
            return -13;
        }
        if data.len() < o_memo {
            return -14;
        }

        // Verify lengths of specific static fields

        // unlock_type should be exactly 1 byte
        let unlock_type_len = o_unlock_value - o_unlock_type;
        if unlock_type_len != 1 {
            debug!("Output {}: Invalid unlock_type length {}", i, unlock_type_len);
            return -15;
        }

        // unlock_value should be exactly 8 bytes (Uint64)
        let unlock_value_len = o_memo - o_unlock_value;
        if unlock_value_len != 8 {
            debug!("Output {}: Invalid unlock_value length {}", i, unlock_value_len);
            return -16;
        }
    }

    0
}