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
pub const ERR_INTERNAL: i32 = 255;

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
}
