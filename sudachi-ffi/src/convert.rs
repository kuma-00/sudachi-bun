use std::ffi::CStr;
use std::os::raw::c_char;
use std::path::PathBuf;

use sudachi::analysis::Mode;

use crate::error::{ERR_INVALID_MODE, ERR_INVALID_UTF8, ERR_NULL_POINTER, error};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub(crate) enum Projection {
    Surface = 0,
    Normalized = 1,
    DictionaryForm = 2,
    Reading = 3,
    DictionaryAndSurface = 4,
    NormalizedAndSurface = 5,
    NormalizedNouns = 6,
}

pub(crate) fn cstr_to_path(ptr: *const c_char) -> Result<PathBuf, i32> {
    if ptr.is_null() {
        return Err(error(ERR_NULL_POINTER, "path pointer was null"));
    }

    let path = unsafe { CStr::from_ptr(ptr) };
    let text = path
        .to_str()
        .map_err(|_| error(ERR_INVALID_UTF8, "path was not valid UTF-8"))?;
    Ok(PathBuf::from(text))
}

pub(crate) fn cstr_to_string(ptr: *const c_char) -> Result<String, i32> {
    if ptr.is_null() {
        return Err(error(ERR_NULL_POINTER, "string pointer was null"));
    }

    let text = unsafe { CStr::from_ptr(ptr) };
    text.to_str()
        .map(|s| s.to_owned())
        .map_err(|_| error(ERR_INVALID_UTF8, "input text was not valid UTF-8"))
}

pub(crate) fn mode_from_raw(mode: i32) -> Result<Mode, i32> {
    match mode {
        0 => Ok(Mode::A),
        1 => Ok(Mode::B),
        2 => Ok(Mode::C),
        _ => Err(error(
            ERR_INVALID_MODE,
            "mode must be 0 (A), 1 (B), or 2 (C)",
        )),
    }
}

pub(crate) fn projection_from_raw(projection: i32) -> Result<Projection, i32> {
    match projection {
        0 => Ok(Projection::Surface),
        1 => Ok(Projection::Normalized),
        2 => Ok(Projection::DictionaryForm),
        3 => Ok(Projection::Reading),
        4 => Ok(Projection::DictionaryAndSurface),
        5 => Ok(Projection::NormalizedAndSurface),
        6 => Ok(Projection::NormalizedNouns),
        _ => Err(error(
            ERR_INVALID_MODE,
            "projection must be 0 (surface), 1 (normalized), 2 (dictionary_form), 3 (reading), 4 (dictionary_and_surface), 5 (normalized_and_surface), or 6 (normalized_nouns)",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_mapping_is_stable() {
        assert!(matches!(mode_from_raw(0), Ok(Mode::A)));
        assert!(matches!(mode_from_raw(1), Ok(Mode::B)));
        assert!(matches!(mode_from_raw(2), Ok(Mode::C)));
        assert!(mode_from_raw(3).is_err());
    }

    #[test]
    fn projection_mapping_is_stable() {
        assert!(matches!(projection_from_raw(0), Ok(Projection::Surface)));
        assert!(matches!(projection_from_raw(1), Ok(Projection::Normalized)));
        assert!(matches!(
            projection_from_raw(2),
            Ok(Projection::DictionaryForm)
        ));
        assert!(matches!(projection_from_raw(3), Ok(Projection::Reading)));
        assert!(matches!(
            projection_from_raw(4),
            Ok(Projection::DictionaryAndSurface)
        ));
        assert!(matches!(
            projection_from_raw(5),
            Ok(Projection::NormalizedAndSurface)
        ));
        assert!(matches!(projection_from_raw(6), Ok(Projection::NormalizedNouns)));
        assert!(projection_from_raw(7).is_err());
    }
}
