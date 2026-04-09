use std::cell::RefCell;
use std::ffi::CString;
use std::os::raw::c_char;
use std::ptr;

pub const OK: i32 = 0;
pub const ERR_NULL_POINTER: i32 = 1;
pub const ERR_INVALID_UTF8: i32 = 2;
pub const ERR_INVALID_MODE: i32 = 3;
pub const ERR_CONFIG: i32 = 4;
pub const ERR_TOKENIZE: i32 = 5;
pub const ERR_SENTENCE_SPLIT: i32 = 6;
pub const ERR_INVALID_INDEX: i32 = 7;
pub const ERR_MORPHEME_SPLIT: i32 = 8;
pub const ERR_INTERNAL: i32 = 255;

const OK_NAME: &[u8] = b"OK\0";
const NULL_POINTER_NAME: &[u8] = b"NULL_POINTER\0";
const INVALID_UTF8_NAME: &[u8] = b"INVALID_UTF8\0";
const INVALID_MODE_NAME: &[u8] = b"INVALID_MODE\0";
const CONFIG_NAME: &[u8] = b"CONFIG\0";
const TOKENIZE_NAME: &[u8] = b"TOKENIZE\0";
const SENTENCE_SPLIT_NAME: &[u8] = b"SENTENCE_SPLIT\0";
const INVALID_INDEX_NAME: &[u8] = b"INVALID_INDEX\0";
const MORPHEME_SPLIT_NAME: &[u8] = b"MORPHEME_SPLIT\0";
const INTERNAL_NAME: &[u8] = b"INTERNAL\0";
const UNKNOWN_NAME: &[u8] = b"UNKNOWN\0";

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

pub(crate) fn set_last_error(message: impl AsRef<str>) {
    let sanitized = message.as_ref().replace('\0', " ");
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = CString::new(sanitized).ok();
    });
}

pub(crate) fn clear_last_error() {
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = None;
    });
}

pub(crate) fn error(code: i32, message: impl AsRef<str>) -> i32 {
    set_last_error(message);
    code
}

pub(crate) fn last_error_ptr() -> *const c_char {
    LAST_ERROR.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(ptr::null(), |value| value.as_ptr())
    })
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn status_code_name(code: i32) -> &'static str {
    match code {
        OK => "OK",
        ERR_NULL_POINTER => "NULL_POINTER",
        ERR_INVALID_UTF8 => "INVALID_UTF8",
        ERR_INVALID_MODE => "INVALID_MODE",
        ERR_CONFIG => "CONFIG",
        ERR_TOKENIZE => "TOKENIZE",
        ERR_SENTENCE_SPLIT => "SENTENCE_SPLIT",
        ERR_INVALID_INDEX => "INVALID_INDEX",
        ERR_MORPHEME_SPLIT => "MORPHEME_SPLIT",
        ERR_INTERNAL => "INTERNAL",
        _ => "UNKNOWN",
    }
}

pub(crate) fn status_code_name_ptr(code: i32) -> *const c_char {
    match code {
        OK => OK_NAME.as_ptr().cast(),
        ERR_NULL_POINTER => NULL_POINTER_NAME.as_ptr().cast(),
        ERR_INVALID_UTF8 => INVALID_UTF8_NAME.as_ptr().cast(),
        ERR_INVALID_MODE => INVALID_MODE_NAME.as_ptr().cast(),
        ERR_CONFIG => CONFIG_NAME.as_ptr().cast(),
        ERR_TOKENIZE => TOKENIZE_NAME.as_ptr().cast(),
        ERR_SENTENCE_SPLIT => SENTENCE_SPLIT_NAME.as_ptr().cast(),
        ERR_INVALID_INDEX => INVALID_INDEX_NAME.as_ptr().cast(),
        ERR_MORPHEME_SPLIT => MORPHEME_SPLIT_NAME.as_ptr().cast(),
        ERR_INTERNAL => INTERNAL_NAME.as_ptr().cast(),
        _ => UNKNOWN_NAME.as_ptr().cast(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;

    #[test]
    fn last_error_round_trips() {
        set_last_error("hello");
        let err = last_error_ptr();
        assert!(!err.is_null());

        let text = unsafe { CStr::from_ptr(err) };
        assert_eq!(text.to_str().unwrap(), "hello");
    }

    #[test]
    fn status_code_names_are_stable() {
        assert_eq!(status_code_name(ERR_TOKENIZE), "TOKENIZE");
        assert_eq!(status_code_name(ERR_SENTENCE_SPLIT), "SENTENCE_SPLIT");
        assert_eq!(status_code_name(ERR_INVALID_INDEX), "INVALID_INDEX");
        assert_eq!(status_code_name(ERR_MORPHEME_SPLIT), "MORPHEME_SPLIT");
        assert_eq!(status_code_name(999), "UNKNOWN");
    }
}
