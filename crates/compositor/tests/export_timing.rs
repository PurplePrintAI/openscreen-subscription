//! Frame-timing regression net for the export paths.
//!
//! The bug class this exists to catch is silent: an exporter that advances its
//! decoder by one SOURCE frame per OUTPUT frame emits the right number of
//! frames while covering only `out_fps / source_fps` of the recording. Frame
//! count alone therefore proves nothing — the content has to be checked.
//! MP4 assertions also check video-stream duration and average fps: an AAC
//! track can make the container look complete while the final video sample
//! has zero duration.
//!
//! So the fixture is a 4 s / 60 fps clip whose colour changes every second
//! (red → green → blue → white). A correct export spans all four colours; a
//! mis-advanced one stays red for its whole length.
//!
//! Needs a D3D11 GPU and the generated media, so it is opt-in: set
//! OPENSCREEN_TEST_MEDIA to a directory holding `screen_colors.mp4` and
//! `webcam_gray.mp4`. Without it every test here skips.
//!
//! Regenerate the media with the vendored ffmpeg:
//!   for c in red green blue white; do ffmpeg -f lavfi \
//!     -i "color=c=$c:size=640x360:duration=1:rate=60" -c:v libopenh264 \
//!     -g 60 -pix_fmt yuv420p seg_$c.mp4; done
//!   ffmpeg -f concat -safe 0 -i concat.txt -c copy screen_colors.mp4
//!   ffmpeg -f lavfi -i "color=c=gray:size=320x240:duration=4:rate=60" \
//!     -c:v libopenh264 -g 60 -pix_fmt yuv420p webcam_gray.mp4

// Pas sur Linux : `pipeline::probe_frame_count` n'existe que dans
// `pipeline_windows` et `pipeline_macos`. Les fichiers de `tests/` sont compiles
// sur TOUTE plateforme, donc sans cette porte ce fichier casse la compilation du
// crate sous Linux — ce que personne ne voyait faute de job Rust Linux en CI (il
// en existe un depuis, d'ou la decouverte). Meme motif que `compose_linux.rs` et
// `warp_device_cannot_decode.rs`, en negatif : ici c'est Linux qu'on exclut, pas
// les autres qu'on cible, pour ne pas retirer ce fichier du job macOS qui le
// compile aujourd'hui.
#![cfg(not(target_os = "linux"))]

use openscreen_compositor::compositor::Compositor;
use openscreen_compositor::config::Cfg;
use openscreen_compositor::d3d::Gpu;
use openscreen_compositor::ffi::*;
use openscreen_compositor::gif_export::{self, GifExportParams};
use openscreen_compositor::pipeline::{self, ClipSource, ExportCodec, ExportParams};
use std::{ffi::CString, path::PathBuf, ptr};

const SOURCE_SEC: f64 = 4.0;

/// Per-frame local colour tables, in order, from a GIF89a file.
///
/// Enough of the format to walk block-to-block: extensions are skipped by
/// their sub-block chain, image descriptors yield their local table and then
/// their LZW data is skipped the same way. No LZW decode — the palette alone
/// says which colours a frame is made of, which is all the timing assertions
/// need.
fn gif_frame_palettes(bytes: &[u8]) -> Vec<Vec<[u8; 3]>> {
    fn table_len(packed: u8) -> usize {
        if packed & 0x80 == 0 {
            0
        } else {
            3 * (1usize << ((packed & 0x07) + 1))
        }
    }
    /// Skips a `len,data…,0` sub-block chain, returning the position after it.
    fn skip_sub_blocks(bytes: &[u8], mut p: usize) -> usize {
        while p < bytes.len() && bytes[p] != 0 {
            p += 1 + bytes[p] as usize;
        }
        p + 1
    }

    let mut palettes = Vec::new();
    let mut p = 6; // "GIF89a"
    let packed = bytes[p + 4];
    p += 7 + table_len(packed); // logical screen descriptor + global table

    while p < bytes.len() {
        match bytes[p] {
            0x21 => p = skip_sub_blocks(bytes, p + 2), // extension: 0x21, label, chain
            0x2C => {
                let packed = bytes[p + 9];
                let start = p + 10;
                let len = table_len(packed);
                palettes.push(
                    bytes[start..start + len]
                        .chunks_exact(3)
                        .map(|c| [c[0], c[1], c[2]])
                        .collect(),
                );
                p = skip_sub_blocks(bytes, start + len + 1); // +1 = LZW min code size
            }
            _ => break, // 0x3B trailer, or done
        }
    }
    palettes
}

/// Mean `R - B` across a palette. The fixture's first second is pure red
/// (large positive) and its last is white (≈ 0), so this single number
/// separates "covered the timeline" from "stuck on frame 0".
fn redness(palette: &[[u8; 3]]) -> f64 {
    if palette.is_empty() {
        return 0.0;
    }
    palette
        .iter()
        .map(|c| c[0] as f64 - c[2] as f64)
        .sum::<f64>()
        / palette.len() as f64
}

fn media_dir() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var("OPENSCREEN_TEST_MEDIA").ok()?);
    dir.join("screen_colors.mp4").exists().then_some(dir)
}

/// One clip covering the whole fixture.
fn whole_clip(dir: &PathBuf) -> ClipSource {
    ClipSource {
        screen: dir.join("screen_colors.mp4").to_string_lossy().into_owned(),
        webcam: dir.join("webcam_gray.mp4").to_string_lossy().into_owned(),
        source_start_sec: 0.0,
        source_end_sec: SOURCE_SEC,
        webcam_offset_sec: 0.0,
        has_audio: false,
    }
}

/// Read the muxed video stream, not the container duration (AAC padding can hide
/// a missing last-frame duration). Use the same pinned libavformat as production.
fn video_timing(path: &str) -> (f64, f64, f64) {
    unsafe {
        let mut fmt = ptr::null_mut();
        let path = CString::new(path).expect("path");
        averr(
            avformat_open_input(&mut fmt, path.as_ptr(), ptr::null_mut(), ptr::null_mut()),
            "open exported MP4",
        )
        .expect("open exported MP4");
        let result = (|| -> anyhow::Result<_> {
            averr(
                avformat_find_stream_info(fmt, ptr::null_mut()),
                "stream info",
            )?;
            for index in 0..sn_fmt_nb_streams(fmt) {
                let stream = sn_fmt_stream(fmt, index as i32);
                if (*(*stream).codecpar).codec_type == AVMediaType::AVMEDIA_TYPE_VIDEO {
                    let tick = (*stream).time_base.num as f64 / (*stream).time_base.den as f64;
                    let fps = (*stream).avg_frame_rate;
                    return Ok((
                        (*stream).duration as f64 * tick,
                        tick,
                        fps.num as f64 / fps.den as f64,
                    ));
                }
            }
            anyhow::bail!("export has no video stream")
        })();
        avformat_close_input(&mut fmt);
        result.expect("video stream timing")
    }
}

fn check_mp4_timing(dir: &PathBuf, fps: u32, codec: ExportCodec, label: &str, seconds: f64) {
    let gpu = Gpu::create(false).expect("gpu");
    let params = ExportParams {
        width: 640,
        height: 360,
        fps: Some(fps),
        codec,
    };
    let comp = Compositor::new_sized(&gpu, params.width, params.height).expect("compositor");
    let out = dir.join(format!("out_timing_{label}_{fps}.mp4"));
    let mut clip = whole_clip(dir);
    clip.source_end_sec = seconds;
    let stats = pipeline::run_composited_multi(
        &[clip],
        &out.to_string_lossy(),
        &gpu,
        &comp,
        &Cfg::c8(),
        &params,
        &mut |_| {},
    )
    .expect("mp4 export");

    let expected_frames = (seconds * fps as f64).round() as u64;
    assert_eq!(
        stats.frames, expected_frames,
        "{label} @ {fps} fps: exported frame count"
    );
    let probed = pipeline::probe_frame_count(&out.to_string_lossy()).expect("probe");
    assert_eq!(
        probed, expected_frames,
        "muxed file disagrees with the reported count"
    );
    let (duration, tick, average_fps) = video_timing(&out.to_string_lossy());
    assert!(
        (duration - seconds).abs() <= tick,
        "{label} @ {fps} fps: video stream ends at {duration}s instead of {seconds}s"
    );
    assert!(
        (average_fps - fps as f64).abs() < 1e-6,
        "{label}: muxed average frame rate is {average_fps}, expected {fps}"
    );
}

/// Counts and stream duration must both follow OUTPUT fps, including the final
/// sample. Container duration alone can appear correct because of its AAC track.
#[test]
fn mp4_export_frame_count_follows_output_fps() {
    let Some(dir) = media_dir() else {
        eprintln!("skipped: set OPENSCREEN_TEST_MEDIA");
        return;
    };
    for fps in [24, 30, 60] {
        check_mp4_timing(&dir, fps, ExportCodec::H264, "h264", SOURCE_SEC);
    }
    // No following timestamp exists from which the muxer could infer duration.
    check_mp4_timing(&dir, 30, ExportCodec::H264, "single_frame", 1.0 / 30.0);
}

#[test]
fn hevc_export_retains_final_frame_duration() {
    let Some(dir) = media_dir() else {
        eprintln!("skipped: set OPENSCREEN_TEST_MEDIA");
        return;
    };
    check_mp4_timing(&dir, 30, ExportCodec::H265, "hevc", SOURCE_SEC);
}

/// The GIF must cover the WHOLE timeline, not just its first
/// `out_fps / source_fps` slice.
///
/// This is the assertion frame count cannot make: an exporter that advances one
/// source frame per output frame still writes 48 frames for a 4 s / 12 fps
/// request — it just takes them all from the first 0.8 s, so every frame is red
/// and the GIF plays 5x slow. Comparing the first and last frame palettes
/// catches exactly that.
#[test]
fn gif_export_spans_the_whole_timeline() {
    let Some(dir) = media_dir() else {
        eprintln!("skipped: set OPENSCREEN_TEST_MEDIA");
        return;
    };
    let out = dir.join("out_timing.gif");
    let params = GifExportParams {
        width: Some(320),
        height: Some(180),
        fps: Some(12),
        loop_count: None,
        dither: false,
    };
    let gpu = Gpu::create(false).expect("gpu");
    // Same contract as the MP4 path: the caller sizes the compositor to the output.
    let comp = Compositor::new_sized(&gpu, 320, 180).expect("compositor");
    let stats = gif_export::export_gif(
        &[whole_clip(&dir)],
        &out,
        &gpu,
        &comp,
        &Cfg::c8(),
        &params,
        &mut |_| {},
    )
    .expect("gif export");

    assert_eq!(
        stats.frames, 48,
        "4 s at 12 fps must be 48 frames, got {}",
        stats.frames
    );

    let bytes = std::fs::read(&out).expect("read gif");
    let palettes = gif_frame_palettes(&bytes);
    assert_eq!(palettes.len(), 48, "GIF carries {} frames", palettes.len());

    let first = redness(&palettes[0]);
    let last = redness(&palettes[palettes.len() - 1]);
    assert!(
        first > 40.0,
        "first frame should be red-dominated (redness {first:.1})"
    );
    assert!(
        last < first - 40.0,
        "last frame still looks like the first — the export never advanced past \
         the opening red second (first {first:.1}, last {last:.1})"
    );
}
