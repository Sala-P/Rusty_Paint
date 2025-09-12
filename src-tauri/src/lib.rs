//use tauri::Manager;
use std::{fs};
use std::io::BufWriter;
use std::path::Path;
use std::sync::Mutex;
use once_cell::sync::Lazy;

use image::{RgbaImage, ImageFormat};
//use image::codecs::png::PngEncoder; 
//use image::ImageEncoder; 

//use imageproc::drawing::{draw_line_segment_mut, draw_hollow_rect_mut}; 
//use imageproc::rect::Rect;

static UNDO_STACK: Lazy<Mutex<Vec<RgbaImage>>> =
    Lazy::new(|| Mutex::new(Vec::new()));
static REDO_STACK: Lazy<Mutex<Vec<RgbaImage>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

const STACK_LIMIT: usize = 50; 

fn vec_to_rgba(vec: Vec<u8>) -> Result<RgbaImage, anyhow::Error> {
    RgbaImage::from_vec(800, 600, vec).ok_or(anyhow::Error::msg("Invalid image data"))
}

#[tauri::command]
fn push_state(snapshot: Vec<u8>){
    let mut undo = UNDO_STACK.lock().unwrap();
    let data = vec_to_rgba(snapshot).unwrap();
    undo.push(data);
    if undo.len() > STACK_LIMIT {
        undo.remove(0); //maybe dont use a vec for this as this is expensive
    }
}

#[tauri::command]
fn undo(snapshot: Vec<u8>) -> Vec<u8> {
    let mut undo = UNDO_STACK.lock().unwrap();
    let mut redo = REDO_STACK.lock().unwrap();

    if let Some(state) = undo.pop() {
        redo.push(vec_to_rgba(snapshot).unwrap());
        if redo.len() > STACK_LIMIT {
            redo.remove(0);
        }

        return state.to_vec();
    }

    unreachable!()
}

#[tauri::command]
fn redo(snapshot: Vec<u8>) -> Vec<u8> {
    let mut undo = UNDO_STACK.lock().unwrap();
    let mut redo = REDO_STACK.lock().unwrap();

    if let Some(state) = redo.pop() {
        undo.push(vec_to_rgba(snapshot).unwrap());
        if undo.len() > STACK_LIMIT {
            undo.remove(0);
        }

        return state.to_vec();
    }

    unreachable!()
}

#[tauri::command]
fn save_image(path: String, data: Vec<u8>) {
    let path_buf = Path::new(&path).to_path_buf();

    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent).unwrap();
    }

    let data = RgbaImage::from_vec(800, 600, data).ok_or(anyhow::Error::msg("Invalid image data")).unwrap();
    data.write_to(&mut BufWriter::new(fs::File::open(path).unwrap()), ImageFormat::Png).unwrap();
}

#[tauri::command]
fn load_image(path: String) -> Vec<u8> {
    image::open(path).unwrap().to_rgba8().to_vec()
}

#[tauri::command]
fn draw_shape(
    shape: &str,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    color: &str,
    _line_width: u32,
    current_png: Option<String>
) -> String {
    use image::{RgbaImage, Rgba, ExtendedColorType};
    use imageproc::drawing::{draw_line_segment_mut, draw_hollow_rect_mut};
    use imageproc::rect::Rect;
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;
    use base64::{engine::general_purpose, Engine as _};

    let mut img = if let Some(data_url) = current_png {
        let b64 = data_url.split_once(',').unwrap().1;
        let bytes = general_purpose::STANDARD.decode(b64).unwrap();
        image::load_from_memory(&bytes).unwrap().to_rgba8()
    } else {
        RgbaImage::new(800, 600)
    };

    let r = u8::from_str_radix(&color[1..3], 16).unwrap();
    let g = u8::from_str_radix(&color[3..5], 16).unwrap();
    let b = u8::from_str_radix(&color[5..7], 16).unwrap();
    let a = 255;
    let rgba = Rgba([r, g, b, a]);

    match shape {
        "line" => draw_line_segment_mut(
            &mut img,
            (start_x as f32, start_y as f32),
            (end_x as f32, end_y as f32),
            rgba,
        ),
        "rect" => {
            let rect = Rect::at(start_x as i32, start_y as i32)
                .of_size(end_x - start_x, end_y - start_y);
            draw_hollow_rect_mut(&mut img, rect, rgba);
        },
        _ => {}
    }

    let mut buf = Vec::new();
    let encoder = PngEncoder::new(&mut buf);
    encoder
        .write_image(&img, img.width(), img.height(), ExtendedColorType::Rgba8)
        .unwrap();

    let b64 = general_purpose::STANDARD.encode(&buf);
    format!("data:image/png;base64,{}", b64)
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_image, load_image, push_state, undo, redo, draw_shape])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
