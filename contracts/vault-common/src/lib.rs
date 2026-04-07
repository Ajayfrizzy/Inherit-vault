#![no_std]

use core::convert::TryInto;

pub const VAULT_TABLE_HEADER_LEN: usize = 24;
pub const SCRIPT_TABLE_HEADER_LEN: usize = 16;
pub const SCRIPT_CODE_HASH_LEN: usize = 32;
pub const BENEFICIARY_ARGS_LEN: usize = 20;
pub const UNLOCK_TYPE_BLOCK_HEIGHT: u8 = 0;
pub const UNLOCK_TYPE_TIMESTAMP: u8 = 1;
pub const HASH_TYPE_TYPE: u8 = 1;
pub const MAX_CLAIM_FEE_SHANNONS: u64 = 100_000;
pub const STANDARD_SECP_CODE_HASH: [u8; 32] = [
    0x9b, 0xd7, 0xe0, 0x6f, 0x3e, 0xcf, 0x4b, 0xe0, 0xf2, 0xfc, 0xd2, 0x18, 0x8b, 0x23,
    0xf1, 0xb9, 0xfc, 0xc8, 0x8e, 0x5d, 0x4b, 0x65, 0xa8, 0x63, 0x7b, 0x17, 0x72, 0x3b,
    0xbd, 0xa3, 0xcc, 0xe8,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(i8)]
pub enum VaultError {
    DataTooShort = -1,
    TotalSizeMismatch = -2,
    OwnerAddressOffset = -3,
    OwnerNameOffset = -4,
    UnlockTypeOffset = -5,
    UnlockValueOffset = -6,
    MemoOffset = -7,
    OwnerAddressField = -8,
    OwnerNameField = -9,
    UnlockTypeLength = -10,
    UnlockValueLength = -11,
    MemoField = -12,
    UnsupportedUnlockType = -13,
    InvalidOwnerLock = -14,
    InvalidLockArgs = -15,
    InvalidTypeArgs = -16,
    MissingOwnerInput = -17,
    UnexpectedVaultLock = -18,
    SinceMustBeAbsolute = -20,
    SinceMetricMismatch = -21,
    SinceTooSmall = -22,
    MissingBeneficiaryOutput = -23,
    UnexpectedOutputLock = -24,
    FeeTooHigh = -25,
    CapacityOverflow = -26,
}

impl VaultError {
    pub const fn code(self) -> i8 {
        self as i8
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ScriptData<'a> {
    pub code_hash: &'a [u8],
    pub hash_type: u8,
    pub args: &'a [u8],
}

#[derive(Clone, Copy, Debug)]
pub struct VaultData<'a> {
    pub owner_lock: ScriptData<'a>,
    pub owner_name: &'a [u8],
    pub unlock_type: u8,
    pub unlock_value: u64,
    pub memo: &'a [u8],
}

fn parse_bytes_field<'a>(
    data: &'a [u8],
    start: usize,
    end: usize,
    err: VaultError,
) -> Result<&'a [u8], VaultError> {
    if end < start + 4 || end > data.len() {
        return Err(err);
    }

    let len = u32::from_le_bytes(
        data[start..start + 4]
            .try_into()
            .map_err(|_| err)?,
    ) as usize;
    let bytes_start = start + 4;
    let bytes_end = bytes_start.checked_add(len).ok_or(err)?;

    if bytes_end != end || bytes_end > data.len() {
        return Err(err);
    }

    Ok(&data[bytes_start..bytes_end])
}

pub fn is_standard_secp_script(
    code_hash: &[u8],
    hash_type: u8,
    args: &[u8],
) -> bool {
    code_hash == STANDARD_SECP_CODE_HASH
        && hash_type == HASH_TYPE_TYPE
        && args.len() == BENEFICIARY_ARGS_LEN
}

pub fn parse_script_data(data: &[u8]) -> Result<ScriptData<'_>, VaultError> {
    if data.len() < SCRIPT_TABLE_HEADER_LEN {
        return Err(VaultError::InvalidOwnerLock);
    }

    let total_size =
        u32::from_le_bytes(data[0..4].try_into().map_err(|_| VaultError::InvalidOwnerLock)?)
            as usize;
    if total_size != data.len() {
        return Err(VaultError::InvalidOwnerLock);
    }

    let o_code_hash =
        u32::from_le_bytes(data[4..8].try_into().map_err(|_| VaultError::InvalidOwnerLock)?)
            as usize;
    let o_hash_type =
        u32::from_le_bytes(data[8..12].try_into().map_err(|_| VaultError::InvalidOwnerLock)?)
            as usize;
    let o_args =
        u32::from_le_bytes(data[12..16].try_into().map_err(|_| VaultError::InvalidOwnerLock)?)
            as usize;

    if o_code_hash != SCRIPT_TABLE_HEADER_LEN {
        return Err(VaultError::InvalidOwnerLock);
    }
    if o_hash_type != o_code_hash + SCRIPT_CODE_HASH_LEN {
        return Err(VaultError::InvalidOwnerLock);
    }
    if o_args != o_hash_type + 1 || o_args > data.len() {
        return Err(VaultError::InvalidOwnerLock);
    }

    let code_hash = &data[o_code_hash..o_hash_type];
    let hash_type = data[o_hash_type];
    let args = parse_bytes_field(data, o_args, data.len(), VaultError::InvalidOwnerLock)?;

    Ok(ScriptData {
        code_hash,
        hash_type,
        args,
    })
}

pub fn parse_vault_data(data: &[u8]) -> Result<VaultData<'_>, VaultError> {
    if data.len() < VAULT_TABLE_HEADER_LEN {
        return Err(VaultError::DataTooShort);
    }

    let total_size =
        u32::from_le_bytes(data[0..4].try_into().map_err(|_| VaultError::TotalSizeMismatch)?)
            as usize;
    if total_size != data.len() {
        return Err(VaultError::TotalSizeMismatch);
    }

    let o_owner_address =
        u32::from_le_bytes(data[4..8].try_into().map_err(|_| VaultError::OwnerAddressOffset)?)
            as usize;
    let o_owner_name =
        u32::from_le_bytes(data[8..12].try_into().map_err(|_| VaultError::OwnerNameOffset)?)
            as usize;
    let o_unlock_type =
        u32::from_le_bytes(data[12..16].try_into().map_err(|_| VaultError::UnlockTypeOffset)?)
            as usize;
    let o_unlock_value =
        u32::from_le_bytes(data[16..20].try_into().map_err(|_| VaultError::UnlockValueOffset)?)
            as usize;
    let o_memo =
        u32::from_le_bytes(data[20..24].try_into().map_err(|_| VaultError::MemoOffset)?)
            as usize;

    if o_owner_address != VAULT_TABLE_HEADER_LEN {
        return Err(VaultError::OwnerAddressOffset);
    }
    if o_owner_name < o_owner_address {
        return Err(VaultError::OwnerNameOffset);
    }
    if o_unlock_type < o_owner_name {
        return Err(VaultError::UnlockTypeOffset);
    }
    if o_unlock_value < o_unlock_type {
        return Err(VaultError::UnlockValueOffset);
    }
    if o_memo < o_unlock_value {
        return Err(VaultError::MemoOffset);
    }
    if o_memo > data.len() {
        return Err(VaultError::MemoOffset);
    }
    if o_unlock_value != o_unlock_type + 1 {
        return Err(VaultError::UnlockTypeLength);
    }
    if o_memo != o_unlock_value + 8 {
        return Err(VaultError::UnlockValueLength);
    }

    let owner_lock = parse_script_data(&data[o_owner_address..o_owner_name])?;
    let owner_name =
        parse_bytes_field(data, o_owner_name, o_unlock_type, VaultError::OwnerNameField)?;
    let memo = parse_bytes_field(data, o_memo, data.len(), VaultError::MemoField)?;

    let unlock_type = data[o_unlock_type];
    if unlock_type != UNLOCK_TYPE_BLOCK_HEIGHT && unlock_type != UNLOCK_TYPE_TIMESTAMP {
        return Err(VaultError::UnsupportedUnlockType);
    }

    let unlock_value = u64::from_le_bytes(
        data[o_unlock_value..o_unlock_value + 8]
            .try_into()
            .map_err(|_| VaultError::UnlockValueLength)?,
    );

    Ok(VaultData {
        owner_lock,
        owner_name,
        unlock_type,
        unlock_value,
        memo,
    })
}

pub fn beneficiary_args_from_lock_args(args: &[u8]) -> Result<&[u8], VaultError> {
    if args.len() != BENEFICIARY_ARGS_LEN {
        return Err(VaultError::InvalidLockArgs);
    }
    Ok(args)
}

pub fn expected_lock_code_hash_from_type_args(args: &[u8]) -> Result<&[u8], VaultError> {
    if args.len() != SCRIPT_CODE_HASH_LEN {
        return Err(VaultError::InvalidTypeArgs);
    }
    Ok(args)
}
