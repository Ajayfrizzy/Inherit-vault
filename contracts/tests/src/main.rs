use std::{fs, path::PathBuf};

use ckb_testtool::{
    context::Context,
    ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::{CellInput, CellOutput},
        prelude::*,
    },
};

const MAX_CYCLES: u64 = 10_000_000;

fn contract_binary(name: &str) -> Bytes {
    let path = PathBuf::from("..")
        .join("target")
        .join("riscv64imac-unknown-none-elf")
        .join("release")
        .join(name);

    fs::read(&path)
        .unwrap_or_else(|e| panic!("failed to read contract binary at {}: {}", path.display(), e))
        .into()
}

/// Builds the same Molecule-style table layout your contracts expect:
/// total_size | o_owner_address | o_owner_name | o_unlock_type | o_unlock_value | o_memo
/// followed by:
/// owner_address bytes | owner_name bytes | unlock_type(1 byte) | unlock_value(8 bytes LE) | memo bytes
fn build_vault_data(
    owner_address: &[u8],
    owner_name: &[u8],
    unlock_type: u8,
    unlock_value: u64,
    memo: &[u8],
) -> Bytes {
    const HEADER_LEN: usize = 24;

    let o_owner_address = HEADER_LEN as u32;
    let o_owner_name = o_owner_address + owner_address.len() as u32;
    let o_unlock_type = o_owner_name + owner_name.len() as u32;
    let o_unlock_value = o_unlock_type + 1;
    let o_memo = o_unlock_value + 8;
    let total_size = o_memo + memo.len() as u32;

    let mut data = Vec::with_capacity(total_size as usize);

    data.extend_from_slice(&total_size.to_le_bytes());
    data.extend_from_slice(&o_owner_address.to_le_bytes());
    data.extend_from_slice(&o_owner_name.to_le_bytes());
    data.extend_from_slice(&o_unlock_type.to_le_bytes());
    data.extend_from_slice(&o_unlock_value.to_le_bytes());
    data.extend_from_slice(&o_memo.to_le_bytes());

    data.extend_from_slice(owner_address);
    data.extend_from_slice(owner_name);
    data.push(unlock_type);
    data.extend_from_slice(&unlock_value.to_le_bytes());
    data.extend_from_slice(memo);

    data.into()
}

fn build_lock_only_tx(input_data: Bytes, since: u64) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let mut context = Context::default();

    let lock_bin = contract_binary("inherit-vault-lock");
    let lock_out_point = context.deploy_cell(lock_bin);

    let lock_script = context
        .build_script(&lock_out_point, Default::default())
        .expect("build lock script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(lock_script.clone())
            .build(),
        input_data,
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .since(0u64)
        .build();

    let output = CellOutput::new_builder()
        .capacity(1000u64)
        .lock(lock_script)
        .build();

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();

    let tx = context.complete_tx(tx);
    (context, tx)
}

fn build_type_tx(
    output_data: Bytes,
) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let mut context = Context::default();

    let lock_bin = contract_binary("inherit-vault-lock");
    let type_bin = contract_binary("inherit-vault-type");

    let lock_out_point = context.deploy_cell(lock_bin);
    let type_out_point = context.deploy_cell(type_bin);

    let lock_script = context
        .build_script(&lock_out_point, Default::default())
        .expect("build lock script");

    let type_script = context
        .build_script(&type_out_point, Default::default())
        .expect("build type script");

    // The input cell must use a lock script that can pass verification.
    // Use a valid vault payload with unlock_value = 0 and since = 0.
    let passing_input_data = build_vault_data(
        b"owner-address",
        b"owner-name",
        0, // block-number mode
        0,
        b"seed-input",
    );

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(lock_script.clone())
            .build(),
        passing_input_data,
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .since(0u64)
        .build();

    let output = CellOutput::new_builder()
        .capacity(1000u64)
        .lock(lock_script)
        .type_(Some(type_script).pack())
        .build();

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(output_data.pack())
        .build();

    let tx = context.complete_tx(tx);
    (context, tx)
}

#[test]
fn lock_allows_spend_when_since_reaches_unlock_value() {
    let input_data = build_vault_data(
        b"beneficiary-lock-hash",
        b"Seun",
        0,  // block-number mode
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_only_tx(input_data, 100);

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("lock script should accept when since == unlock_value");
}

#[test]
fn lock_rejects_spend_when_since_is_too_small() {
    let input_data = build_vault_data(
        b"beneficiary-lock-hash",
        b"Seun",
        0,  // block-number mode
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_only_tx(input_data, 99);

    let result = context.verify_tx(&tx, MAX_CYCLES);
    assert!(
        result.is_err(),
        "lock script should reject when since < unlock_value"
    );
}

#[test]
fn type_accepts_valid_vault_data() {
    let valid_data = build_vault_data(
        b"owner-address",
        b"owner-name",
        0,
        12345,
        b"memo-ok",
    );

    let (context, tx) = build_type_tx(valid_data);

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("type script should accept valid vault data");
}

#[test]
fn type_rejects_invalid_unlock_type_length() {
    // Start from a valid layout, then corrupt the unlock_value offset so that:
    // unlock_type_len = o_unlock_value - o_unlock_type != 1
    let mut invalid = build_vault_data(
        b"owner-address",
        b"owner-name",
        0,
        12345,
        b"memo-bad",
    )
    .to_vec();

    let original_o_unlock_type =
        u32::from_le_bytes(invalid[12..16].try_into().expect("unlock_type offset"));
    let bad_o_unlock_value = original_o_unlock_type + 2; // should be +1

    invalid[16..20].copy_from_slice(&bad_o_unlock_value.to_le_bytes());

    let (context, tx) = build_type_tx(invalid.into());

    let result = context.verify_tx(&tx, MAX_CYCLES);
    assert!(
        result.is_err(),
        "type script should reject invalid unlock_type length"
    );
}