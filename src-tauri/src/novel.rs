use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use anyhow::{bail, Result};
use chardetng::EncodingDetector;
use encoding_rs::Encoding;

pub fn load_text<P: AsRef<Path>>(path: P) -> Result<String> {
    let path = path.as_ref();
    if !path.exists() {
        bail!("文件不存在: {}", path.display());
    }

    let mut reader = BufReader::new(File::open(path)?);
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer)?;

    let encoding = detect_encoding(&buffer);
    let (cow, _, had_errors) = encoding.decode(&buffer);
    if had_errors {
        bail!("文本转换失败，可能包含无效编码");
    }
    Ok(cow.into_owned())
}

fn detect_encoding(buffer: &[u8]) -> &'static Encoding {
    let mut detector = EncodingDetector::new();
    detector.feed(buffer, true);
    detector.guess(None, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn load_text_reads_utf8() {
        let tmp = std::env::temp_dir().join("moyu-reader-load-text.txt");
        fs::write(&tmp, "123\n456").unwrap();
        let text = load_text(&tmp).unwrap();
        assert_eq!(text.trim(), "123\n456");
    }
}
