use std::{fs, path::PathBuf};

use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    context::Context,
    ckb_types::{
        bytes::Bytes,
        core::{ScriptHashType, TransactionBuilder},
        packed::{Byte32, CellInput, CellOutput, OutPoint, Script},
        prelude::*,
    },
};
use vault_common::{
    MAX_CLAIM_FEE_SHANNONS, STANDARD_SECP_CODE_HASH, UNLOCK_TYPE_BLOCK_HEIGHT,
    UNLOCK_TYPE_TIMESTAMP,
};

const MAX_CYCLES: u64 = 10_000_000;
const BASE_CAPACITY: u64 = 1_000_000_000;

fn contract_binary(name: &str) -> Bytes {
    let candidates = [
        PathBuf::from("..")
            .join("target")
            .join("riscv64imac-unknown-none-elf")
            .join("debug")
            .join(name),
        PathBuf::from("..")
            .join("target")
            .join("riscv64imac-unknown-none-elf")
            .join("release")
            .join(name),
        PathBuf::from("..").join("build").join("release").join(name),
    ];

    for path in candidates {
        if let Ok(bytes) = fs::read(&path) {
            return bytes.into();
        }
    }

    panic!(
        "failed to read contract binary for {} from target debug/release or build/release",
        name
    );
}

fn pack_bytes_field(value: &[u8]) -> Vec<u8> {
    let mut packed = Vec::with_capacity(4 + value.len());
    packed.extend_from_slice(&(value.len() as u32).to_le_bytes());
    packed.extend_from_slice(value);
    packed
}

fn build_owner_lock_data(lock: &Script) -> Vec<u8> {
    const SCRIPT_HEADER_LEN: usize = 16;

    let code_hash = lock.code_hash().raw_data();
    let hash_type = lock.hash_type().as_slice().first().copied().unwrap_or_default();
    let args = lock.args().raw_data();
    let args_field = pack_bytes_field(args.as_ref());

    let o_code_hash = SCRIPT_HEADER_LEN as u32;
    let o_hash_type = o_code_hash + code_hash.len() as u32;
    let o_args = o_hash_type + 1;
    let total_size = o_args + args_field.len() as u32;

    let mut data = Vec::with_capacity(total_size as usize);
    data.extend_from_slice(&total_size.to_le_bytes());
    data.extend_from_slice(&o_code_hash.to_le_bytes());
    data.extend_from_slice(&o_hash_type.to_le_bytes());
    data.extend_from_slice(&o_args.to_le_bytes());
    data.extend_from_slice(code_hash.as_ref());
    data.push(hash_type);
    data.extend_from_slice(&args_field);
    data
}

fn build_vault_data(
    owner_lock: &Script,
    owner_name: &[u8],
    unlock_type: u8,
    unlock_value: u64,
    memo: &[u8],
) -> Bytes {
    const HEADER_LEN: usize = 24;
    let owner_lock_field = build_owner_lock_data(owner_lock);
    let owner_name_field = pack_bytes_field(owner_name);
    let memo_field = pack_bytes_field(memo);

    let o_owner_lock = HEADER_LEN as u32;
    let o_owner_name = o_owner_lock + owner_lock_field.len() as u32;
    let o_unlock_type = o_owner_name + owner_name_field.len() as u32;
    let o_unlock_value = o_unlock_type + 1;
    let o_memo = o_unlock_value + 8;
    let total_size = o_memo + memo_field.len() as u32;

    let mut data = Vec::with_capacity(total_size as usize);
    data.extend_from_slice(&total_size.to_le_bytes());
    data.extend_from_slice(&o_owner_lock.to_le_bytes());
    data.extend_from_slice(&o_owner_name.to_le_bytes());
    data.extend_from_slice(&o_unlock_type.to_le_bytes());
    data.extend_from_slice(&o_unlock_value.to_le_bytes());
    data.extend_from_slice(&o_memo.to_le_bytes());
    data.extend_from_slice(&owner_lock_field);
    data.extend_from_slice(&owner_name_field);
    data.push(unlock_type);
    data.extend_from_slice(&unlock_value.to_le_bytes());
    data.extend_from_slice(&memo_field);
    data.into()
}

fn beneficiary_args() -> Vec<u8> {
    vec![0x42; 20]
}

fn absolute_timestamp_since(value: u64) -> u64 {
    (1u64 << 62) | value
}

fn beneficiary_lock(args: &[u8]) -> Script {
    Script::new_builder()
        .code_hash(Byte32::from_slice(&STANDARD_SECP_CODE_HASH).expect("standard secp code hash"))
        .hash_type(ScriptHashType::Type)
        .args(args.to_vec().pack())
        .build()
}

fn build_lock_claim_tx(
    input_data: Bytes,
    since: u64,
    output_lock: Script,
    output_capacity: u64,
) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let mut context = Context::default();

    let lock_bin = contract_binary("inherit-vault-lock");
    let lock_out_point = context.deploy_cell(lock_bin);
    let beneficiary_args = beneficiary_args();

    let lock_script = context
        .build_script(&lock_out_point, Bytes::from(beneficiary_args))
        .expect("build lock script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(BASE_CAPACITY)
            .lock(lock_script.clone())
            .build(),
        input_data,
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .since(since)
        .build();

    let output = CellOutput::new_builder()
        .capacity(output_capacity)
        .lock(output_lock)
        .build();

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();

    let tx = context.complete_tx(tx);
    (context, tx)
}

fn setup_type_scripts() -> (Context, Script, Script, Script, OutPoint) {
    let mut context = Context::default();
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_out_point = context.deploy_cell(contract_binary("inherit-vault-lock"));
    let type_out_point = context.deploy_cell(contract_binary("inherit-vault-type"));

    let owner_lock = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build owner lock");
    let alt_owner_lock = context
        .build_script(&always_success_out_point, Bytes::from(vec![0x01]))
        .expect("build alternate owner lock");
    let vault_lock = context
        .build_script(&lock_out_point, Bytes::from(beneficiary_args()))
        .expect("build vault lock");

    (context, owner_lock, alt_owner_lock, vault_lock, type_out_point)
}

fn build_type_create_tx(
    mut context: Context,
    type_out_point: OutPoint,
    input_lock: Script,
    output_lock: Script,
    type_args: Bytes,
    output_data: Bytes,
) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let type_script = context
        .build_script(&type_out_point, type_args)
        .expect("build type script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(BASE_CAPACITY)
            .lock(input_lock.clone())
            .build(),
        Bytes::new(),
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();

    let output = CellOutput::new_builder()
        .capacity(BASE_CAPACITY)
        .lock(output_lock)
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

fn build_type_destroy_tx(
    input_data: Bytes,
    since: u64,
) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let mut context = Context::default();
    let beneficiary_args = beneficiary_args();

    let lock_out_point = context.deploy_cell(contract_binary("inherit-vault-lock"));
    let type_out_point = context.deploy_cell(contract_binary("inherit-vault-type"));

    let lock_script = context
        .build_script(&lock_out_point, Bytes::from(beneficiary_args.clone()))
        .expect("build lock script");
    let type_script = context
        .build_script(&type_out_point, lock_script.code_hash().raw_data())
        .expect("build type script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(BASE_CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(type_script).pack())
            .build(),
        input_data,
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .since(since)
        .build();

    let output = CellOutput::new_builder()
        .capacity(BASE_CAPACITY - 10_000)
        .lock(beneficiary_lock(&beneficiary_args))
        .build();

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();

    let tx = context.complete_tx(tx);
    (context, tx)
}

#[test]
fn lock_allows_claim_to_beneficiary_when_unlock_is_reached() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        100,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("lock script should accept a claim that pays the beneficiary after unlock");
}

#[test]
fn lock_rejects_spend_when_since_is_too_small() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        99,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject when since < unlock_value"
    );
}

#[test]
fn lock_rejects_relative_since() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        (1u64 << 63) | 100,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject relative since values"
    );
}

#[test]
fn lock_rejects_metric_mismatch() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_TIMESTAMP,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        100,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject timestamp vaults claimed with block-number since"
    );
}

#[test]
fn lock_allows_timestamp_claim_to_beneficiary_when_unlock_is_reached() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_TIMESTAMP,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        absolute_timestamp_since(100),
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    let encoded_since: u64 = tx
        .data()
        .raw()
        .inputs()
        .get(0)
        .expect("first input")
        .since()
        .unpack();
    assert_eq!(encoded_since, absolute_timestamp_since(100));

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("lock script should accept a timestamp claim that meets the unlock time");
}

#[test]
fn lock_rejects_malformed_vault_data() {
    let beneficiary_args = beneficiary_args();
    let malformed = Bytes::from_static(b"bad");
    let (context, tx) = build_lock_claim_tx(
        malformed,
        100,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - 10_000,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject malformed vault data"
    );
}

#[test]
fn lock_rejects_outputs_that_do_not_pay_the_beneficiary() {
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args()),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );
    let wrong_args = vec![0x11; 20];

    let (context, tx) = build_lock_claim_tx(
        input_data,
        100,
        beneficiary_lock(&wrong_args),
        BASE_CAPACITY - 10_000,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject outputs that redirect funds away from the beneficiary"
    );
}

#[test]
fn lock_rejects_claims_with_excessive_fee_burn() {
    let beneficiary_args = beneficiary_args();
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_lock_claim_tx(
        input_data,
        100,
        beneficiary_lock(&beneficiary_args),
        BASE_CAPACITY - MAX_CLAIM_FEE_SHANNONS - 1,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "lock script should reject claims that burn too much fee"
    );
}

#[test]
fn type_accepts_valid_owner_authenticated_vault() {
    let (context, owner_lock, _, vault_lock, type_out_point) = setup_type_scripts();
    let valid_data = build_vault_data(
        &owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-ok",
    );

    let (context, tx) = build_type_create_tx(
        context,
        type_out_point,
        owner_lock,
        vault_lock.clone(),
        vault_lock.code_hash().raw_data(),
        valid_data,
    );

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("type script should accept a valid owner-authenticated vault");
}

#[test]
fn type_rejects_missing_authenticated_owner_input() {
    let (context, owner_lock, alt_owner_lock, vault_lock, type_out_point) = setup_type_scripts();
    let valid_data = build_vault_data(
        &alt_owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-ok",
    );

    let (context, tx) = build_type_create_tx(
        context,
        type_out_point,
        owner_lock,
        vault_lock.clone(),
        vault_lock.code_hash().raw_data(),
        valid_data,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "type script should reject vault creation when the claimed owner did not authorize an input"
    );
}

#[test]
fn type_rejects_unexpected_vault_lock() {
    let (context, owner_lock, alt_owner_lock, vault_lock, type_out_point) = setup_type_scripts();
    let valid_data = build_vault_data(
        &owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-ok",
    );

    let (context, tx) = build_type_create_tx(
        context,
        type_out_point,
        owner_lock.clone(),
        alt_owner_lock,
        vault_lock.code_hash().raw_data(),
        valid_data,
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "type script should reject outputs that do not use the authenticated vault lock"
    );
}

#[test]
fn type_rejects_invalid_type_args() {
    let (context, owner_lock, _, vault_lock, type_out_point) = setup_type_scripts();
    let valid_data = build_vault_data(
        &owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-ok",
    );

    let (context, tx) =
        build_type_create_tx(context, type_out_point, owner_lock, vault_lock, Bytes::new(), valid_data);

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "type script should reject typed vaults without the expected lock code hash in args"
    );
}

#[test]
fn type_rejects_invalid_unlock_type_length() {
    let (context, owner_lock, _, vault_lock, type_out_point) = setup_type_scripts();
    let mut invalid = build_vault_data(
        &owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-bad",
    )
    .to_vec();

    let original_o_unlock_type =
        u32::from_le_bytes(invalid[12..16].try_into().expect("unlock_type offset"));
    let bad_o_unlock_value = original_o_unlock_type + 2;
    invalid[16..20].copy_from_slice(&bad_o_unlock_value.to_le_bytes());

    let (context, tx) = build_type_create_tx(
        context,
        type_out_point,
        owner_lock,
        vault_lock.clone(),
        vault_lock.code_hash().raw_data(),
        invalid.into(),
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "type script should reject invalid unlock_type length"
    );
}

#[test]
fn type_rejects_invalid_unlock_type_value() {
    let (context, owner_lock, _, vault_lock, type_out_point) = setup_type_scripts();
    let mut invalid = build_vault_data(
        &owner_lock,
        b"owner-name",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        12345,
        b"memo-bad",
    )
    .to_vec();

    let o_unlock_type =
        u32::from_le_bytes(invalid[12..16].try_into().expect("unlock_type offset")) as usize;
    invalid[o_unlock_type] = 9;

    let (context, tx) = build_type_create_tx(
        context,
        type_out_point,
        owner_lock,
        vault_lock.clone(),
        vault_lock.code_hash().raw_data(),
        invalid.into(),
    );

    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "type script should reject unsupported unlock types"
    );
}

#[test]
fn type_allows_destroy_claim_path_with_no_group_outputs() {
    let input_data = build_vault_data(
        &beneficiary_lock(&beneficiary_args()),
        b"Seun",
        UNLOCK_TYPE_BLOCK_HEIGHT,
        100,
        b"inheritance vault",
    );

    let (context, tx) = build_type_destroy_tx(input_data, 100);

    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("type script should allow destroying the typed vault on claim");
}
