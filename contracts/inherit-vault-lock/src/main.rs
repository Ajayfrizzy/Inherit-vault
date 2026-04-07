#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};

entry!(program_entry);
default_alloc!();

use ckb_std::{
    ckb_constants::Source,
    ckb_types::prelude::*,
    debug,
    error::SysError,
    high_level::{
        load_cell_capacity, load_cell_lock, load_cell_data, load_input_since, load_script, QueryIter,
    },
    syscalls::exit,
};
use vault_common::{
    beneficiary_args_from_lock_args, is_standard_secp_script, parse_vault_data, VaultError,
    MAX_CLAIM_FEE_SHANNONS, UNLOCK_TYPE_TIMESTAMP,
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

fn is_expected_beneficiary_lock(
    lock: &ckb_std::ckb_types::packed::Script,
    beneficiary_args: &[u8],
) -> bool {
    let lock_args = lock.args().raw_data();

    is_standard_secp_script(
        lock.code_hash().as_slice(),
        lock.hash_type().as_slice().first().copied().unwrap_or_default(),
        lock_args.as_ref(),
    ) && bytes_eq(lock_args.as_ref(), beneficiary_args)
}

pub fn program_entry() -> i8 {
    let current_script = match load_script() {
        Ok(script) => script,
        Err(_) => return VaultError::InvalidLockArgs.code(),
    };
    let script_args = current_script.args().raw_data();
    let beneficiary_args = match beneficiary_args_from_lock_args(script_args.as_ref()) {
        Ok(args) => args,
        Err(error) => return error.code(),
    };

    let mut found_inputs = false;
    let mut group_input_capacity = 0u64;

    for (i, since) in QueryIter::new(load_input_since, Source::GroupInput).enumerate() {
        found_inputs = true;

        let input_capacity = match load_cell_capacity(i, Source::GroupInput) {
            Ok(capacity) => capacity,
            Err(_) => return VaultError::CapacityOverflow.code(),
        };
        group_input_capacity = match group_input_capacity.checked_add(input_capacity) {
            Some(total) => total,
            None => return VaultError::CapacityOverflow.code(),
        };

        let data = match load_cell_data(i, Source::GroupInput) {
            Ok(d) => d,
            Err(_) => return VaultError::DataTooShort.code(),
        };

        let vault = match parse_vault_data(&data) {
            Ok(vault) => vault,
            Err(error) => {
                debug!("Invalid vault data in group input {}", i);
                return error.code();
            }
        };

        let is_absolute = (since >> 63) == 0;
        let is_timestamp = ((since >> 61) & 0b11) == 0b10;
        let cell_is_timestamp = vault.unlock_type == UNLOCK_TYPE_TIMESTAMP;

        if !is_absolute {
            debug!("Transaction since field must be absolute");
            return VaultError::SinceMustBeAbsolute.code();
        }

        if is_timestamp != cell_is_timestamp {
            debug!("Mismatch between cell timelock metric and transaction since metric");
            return VaultError::SinceMetricMismatch.code();
        }

        let since_value = since & 0x00FF_FFFF_FFFF_FFFF;

        if since_value < vault.unlock_value {
            debug!(
                "Timelock enforced: transaction since {} < vault unlock {}",
                since_value,
                vault.unlock_value
            );
            return VaultError::SinceTooSmall.code();
        }
    }

    if !found_inputs {
        return 0;
    }

    let mut beneficiary_output_capacity = 0u64;
    let mut found_beneficiary_output = false;
    let mut output_index = 0usize;

    loop {
        let output_lock = match load_cell_lock(output_index, Source::Output) {
            Ok(lock) => lock,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return VaultError::UnexpectedOutputLock.code(),
        };

        if !is_expected_beneficiary_lock(&output_lock, beneficiary_args) {
            debug!("Claim outputs must remain locked to the beneficiary");
            return VaultError::UnexpectedOutputLock.code();
        }

        found_beneficiary_output = true;
        let output_capacity = match load_cell_capacity(output_index, Source::Output) {
            Ok(capacity) => capacity,
            Err(_) => return VaultError::CapacityOverflow.code(),
        };
        beneficiary_output_capacity = match beneficiary_output_capacity.checked_add(output_capacity) {
            Some(total) => total,
            None => return VaultError::CapacityOverflow.code(),
        };
        output_index += 1;
    }

    if !found_beneficiary_output {
        debug!("Claim transaction must create at least one beneficiary output");
        return VaultError::MissingBeneficiaryOutput.code();
    }

    let fee_burn = if group_input_capacity >= beneficiary_output_capacity {
        group_input_capacity - beneficiary_output_capacity
    } else {
        return VaultError::FeeTooHigh.code();
    };

    if fee_burn <= MAX_CLAIM_FEE_SHANNONS {
        exit(0);
    }

    debug!("Claim fee exceeds the allowed ceiling");
    VaultError::FeeTooHigh.code()
}
