import { invoke } from "@tauri-apps/api/core";

const canvas = document.getElementById("paint") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const colorPicker = document.getElementById("colorPicker") as HTMLInputElement;
const brushSize = document.getElementById("brushSize") as HTMLInputElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const loadBtn = document.getElementById("loadBtn") as HTMLButtonElement;
const fileNameInput = document.getElementById("fileName") as HTMLInputElement;
const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement;
const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement;
const shapeSelect = document.getElementById("shapeSelect") as HTMLSelectElement;

let drawing = false;
let startX = 0;
let startY = 0;
let tool = "brush"; 


shapeSelect.addEventListener("change", () => {
  tool = shapeSelect.value; // "brush", "line", "rect"
});


canvas.addEventListener("mousedown", (e) => {
  drawing = true;
  startX = e.offsetX;
  startY = e.offsetY;

  if (tool === "brush") ctx.beginPath();
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  if (tool === "brush") {
    ctx.lineWidth = parseInt(brushSize.value, 10);
    ctx.lineCap = "round";
    ctx.strokeStyle = colorPicker.value;

    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  }
});

// Mouseup: stop drawing and send shape to Rust if needed
canvas.addEventListener("mouseup", async (e) => {
  if (!drawing) return;
  drawing = false;

  const endX = e.offsetX;
  const endY = e.offsetY;
  const color = colorPicker.value;
  const lineWidth = parseInt(brushSize.value, 10);

  if (tool === "brush") {
    ctx.beginPath();
    const snapshot = canvas.toDataURL("image/png");
    await invoke("push_state", { snapshot });
  } else {
    const dataUrl = canvas.toDataURL("image/png");
    const newImage = await invoke<string>("draw_shape", {
      shape: tool,
      startX,
      startY,
      endX,
      endY,
      color,
      lineWidth,
      current_png: dataUrl,
    });

    const img = new Image();
    img.src = newImage;
    img.onload = () => ctx.drawImage(img, 0, 0);

    const snapshot = canvas.toDataURL("image/png");
    await invoke("push_state", { snapshot });
  }
});

// Clear 
clearBtn.addEventListener("click", async () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const snapshot = canvas.toDataURL("image/png");
  await invoke("push_state", { snapshot });
});

// Save //fix so you can save anywhere
saveBtn.addEventListener("click", async () => {
  let fileName = fileNameInput.value.trim();
  if (!fileName) return alert("Please enter a file name!");
  if (!fileName.toLowerCase().endsWith(".png")) {
    fileName += ".png";
  }

  const dataUrl = canvas.toDataURL("image/png");
  const path = `saved_images/${fileName}`;

  try {
    await invoke("save_image", { path, data: dataUrl });
    alert(`Saved as ${path}`);
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed, check console.");
  }
});

// Load //fix so you can load from anywhere
loadBtn.addEventListener("click", async () => {
  let fileName = fileNameInput.value.trim();
  if (!fileName) return alert("Please enter a file name!");
  if (!fileName.toLowerCase().endsWith(".png")) {
    fileName += ".png";
  }

  const path = `saved_images/${fileName}`;

  try {
    const bitmap = await invoke<Uint8Array>("load_image", { path });
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  } catch (err) {
    console.error("Load failed:", err);
    alert("Load failed, check console.");
  }
});

// Undo
undoBtn.addEventListener("click", async () => {
  const state = await invoke<string | null>("undo");
  if (state) {
    const img = new Image();
    img.src = state;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  }
});
//redo
redoBtn.addEventListener("click", async () => {
  const state = await invoke<string | null>("redo");
  if (state) {
    const img = new Image();
    img.src = state;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  }
});

// On page load, push initial empty state
window.addEventListener("load", async () => {
  const snapshot = canvas.toDataURL("image/png");
  await invoke("push_state", { snapshot });
});
