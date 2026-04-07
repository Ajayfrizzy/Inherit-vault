#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};

entry!(program_entry);
default_alloc!();

use ckb_std::{
    ckb_constants::Source,
    debug,
    ckb_types::prelude::*,
    high_level::{load_cell_data, load_cell_lock, load_script, QueryIter},
};
use vault_common::{
    beneficiary_args_from_lock_args, expected_lock_code_hash_from_type_args, parse_vault_data,
    VaultError, HASH_TYPE_TYPE,
};

fn bytes_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    let mut index = 0usize;
    while index < left.len() {
        if left[index] != right[index] {
            return false;
        }
        index += 1;
    }

    true
}

fn input_matches_owner_lock(
    owner_lock: vault_common::ScriptData<'_>,
) -> bool {
    for lock in QueryIter::new(load_cell_lock, Source::Input) {
        let args = lock.args().raw_data();
        let hash_type = lock.hash_type().as_slice().first().copied().unwrap_or_default();

        if bytes_eq(lock.code_hash().as_slice(), owner_lock.code_hash)
            && hash_type == owner_lock.hash_type
            && bytes_eq(args.as_ref(), owner_lock.args)
        {
            return true;
        }
    }

    false
}

fn output_uses_expected_vault_lock(
    lock: &ckb_std::ckb_types::packed::Script,
    expected_lock_code_hash: &[u8],
) -> bool {
    let lock_args = lock.args().raw_data();
    let hash_type = lock.hash_type().as_slice().first().copied().unwrap_or_default();

    bytes_eq(lock.code_hash().as_slice(), expected_lock_code_hash)
        && hash_type == HASH_TYPE_TYPE
        && beneficiary_args_from_lock_args(lock_args.as_ref()).is_ok()
}

pub fn program_entry() -> i8 {
    let current_script = match load_script() {
        Ok(script) => script,
        Err(_) => return VaultError::InvalidTypeArgs.code(),
    };
    let current_script_args = current_script.args().raw_data();
    let expected_lock_code_hash =
        match expected_lock_code_hash_from_type_args(current_script_args.as_ref()) {
            Ok(code_hash) => code_hash,
            Err(error) => return error.code(),
        };

    let mut saw_group_output = false;

    for (i, data) in QueryIter::new(|i, s| load_cell_data(i, s), Source::GroupOutput).enumerate() {
        saw_group_output = true;
        let vault = match parse_vault_data(&data) {
            Ok(vault) => vault,
            Err(error) => {
                debug!("Output {} contains malformed vault data", i);
                return error.code();
            }
        };

        let output_lock = match load_cell_lock(i, Source::GroupOutput) {
            Ok(lock) => lock,
            Err(_) => return VaultError::UnexpectedVaultLock.code(),
        };

        if !output_uses_expected_vault_lock(&output_lock, expected_lock_code_hash) {
            debug!("Output {} does not use the authenticated vault lock", i);
            return VaultError::UnexpectedVaultLock.code();
        }

        if !input_matches_owner_lock(vault.owner_lock) {
            debug!("Output {} is missing an input from the claimed owner", i);
            return VaultError::MissingOwnerInput.code();
        }

    }

    if !saw_group_output {
        return 0;
    }

    0
}
