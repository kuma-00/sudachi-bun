use crate::error::{OK, clear_last_error};

pub(crate) fn run_ffi(body: impl FnOnce() -> Result<(), i32>) -> i32 {
    clear_last_error();
    match body() {
        Ok(()) => OK,
        Err(code) => code,
    }
}

pub(crate) fn free_handle<T>(handle: *mut T) {
    if handle.is_null() {
        return;
    }

    // Safety: callers pass pointers obtained from Box::into_raw.
    unsafe {
        drop(Box::from_raw(handle));
    }
}
