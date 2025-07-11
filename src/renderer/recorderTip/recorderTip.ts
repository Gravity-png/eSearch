import {
    addClass,
    button,
    dynamicSelect,
    ele,
    image,
    pack,
    trackPoint,
    txt,
    view,
} from "dkh-ui";
import { jsKeyCodeDisplay } from "../../../lib/key";

import { Class, cssVar, getImgUrl, initStyle } from "../root/root";

import store from "../../../lib/store/renderStore";
import { renderOn, renderSend } from "../../../lib/ipc";
import type { IconType } from "../../iconTypes";
import { typedEntries } from "../../../lib/utils";

function initRecord() {
    if (store.get("录屏.提示.键盘.开启") || store.get("录屏.提示.鼠标.开启"))
        // biome-ignore format:
        // biome-ignore lint: 部分引入
        var { uIOhook, UiohookKey } = require("uiohook-napi") as typeof import("uiohook-napi");

    function rKey() {
        const posi = store.get("录屏.提示.键盘.位置");
        const px = posi.x === "+" ? "right" : "left";
        const py = posi.y === "+" ? "bottom" : "top";
        const pel = keysEl.parentElement as HTMLElement;
        pel.style[px] = `${posi.offsetX}px`;
        pel.style[py] = `${posi.offsetY}px`;

        keysEl.style.fontSize = `${store.get("录屏.提示.键盘.大小") * 16}px`;

        const keycode2key: Record<number, string | number> = {};

        for (const [i, v] of typedEntries(UiohookKey)) {
            keycode2key[v] = i;
        }
        console.log(keycode2key);

        const map: { [k: string]: string } = {
            Ctrl: "Control",
            CtrlRight: "ControlRight",
        };

        for (let i = 0; i < 25; i++) {
            const k = String.fromCharCode(65 + i);
            map[k] = `Key${k}`;
        }

        function getKey(keycode: number) {
            const key = keycode2key[keycode] as string;

            const keyDisplay = jsKeyCodeDisplay(map[key] || key);

            const mainKey = keyDisplay.primary ?? key;
            let topKey = keyDisplay?.secondary ?? keyDisplay?.symble ?? "";
            if (keyDisplay.isNumpad) topKey = "";
            return {
                main: mainKey,
                top: topKey,
                numpad: keyDisplay.isNumpad,
                right: keyDisplay.isRight,
            };
        }

        let keyO: number[] = [];

        let lastKey = null as ReturnType<typeof view> | null;

        uIOhook.on("keydown", (e) => {
            if (!keyO.includes(e.keycode)) keyO.push(e.keycode);
            if (!lastKey) {
                lastKey = view();
                if (posi.x === "+") keysEl.append(lastKey.el);
                else keysEl.insertAdjacentElement("afterbegin", lastKey.el);
            }
            const key = getKey(e.keycode);
            if (["Ctrl", "Alt", "Shift", "Meta"].includes(key.main))
                lastKey.data({ modi: "true" });
            const kbdEl = ele("kbd").add(
                txt(key.main)
                    .class("main_key")
                    .data({ k: e.keycode.toString() }),
            );
            console.log(key);

            if (key.top) kbdEl.add(txt(key.top).class("top_key"));
            else {
                kbdEl.el.querySelector("span")?.classList.remove("main_key");
                kbdEl.el.classList.add("only_key");
            }
            lastKey.add(kbdEl);
            if (key.numpad) kbdEl.el.classList.add("numpad_key");
            if (key.right) kbdEl.el.classList.add("right_key");
            const l = Array.from(keysEl.children);
            if (posi.x === "+") {
                for (const v of l.slice(0, -10)) v.remove();
            } else {
                for (const v of l.slice(10)) v.remove();
            }
        });
        uIOhook.on("keyup", (e) => {
            keyO = keyO.filter((i) => i !== e.keycode);
            for (const el of (lastKey?.el
                .querySelectorAll(`[data-k="${e.keycode}"]`)
                ?.values() as Iterable<HTMLElement>) || []) {
                el.classList.add("key_hidden");
            }
            if (keyO.length === 0) {
                const e = lastKey;
                setTimeout(() => {
                    e?.style({ opacity: "0" });
                }, 4000);
                lastKey = null;
            }
        });
    }

    function rMouse() {
        const m2m = { 1: mouseKey.left, 3: mouseKey.center, 2: mouseKey.right };

        uIOhook.on("mousedown", (e) => {
            const b = e.button as 1 | 2 | 3;
            m2m[b].el.style.backgroundColor = "#00f";
        });
        uIOhook.on("mouseup", (e) => {
            const b = e.button as 1 | 2 | 3;
            m2m[b].el.style.backgroundColor = "";
        });

        let time_out: NodeJS.Timeout;
        uIOhook.on("wheel", (e) => {
            console.log(e.direction, e.rotation);
            const x = {
                3: { 1: "wheel_u", "-1": "wheel_d" },
                4: { 1: "wheel_l", "-1": "wheel_r" },
            } as const;
            if (e.rotation === 1 || e.rotation === -1)
                recorderMouseEl.className = x[e.direction][e.rotation];
            else recorderMouseEl.className = "";
            clearTimeout(time_out);
            time_out = setTimeout(() => {
                recorderMouseEl.className = "";
            }, 200);
        });
    }

    if (store.get("录屏.提示.键盘.开启")) rKey();
    if (store.get("录屏.提示.鼠标.开启")) rMouse();

    if (store.get("录屏.提示.键盘.开启") || store.get("录屏.提示.鼠标.开启"))
        // @ts-ignore
        uIOhook.start();

    if (store.get("录屏.提示.光标.开启"))
        recorderMouseEl.style.display = "flex";

    const mouseStyle = document.createElement("style");
    mouseStyle.innerHTML = `.mouse{${store.get("录屏.提示.光标.样式").replaceAll(";", " !important;")}}`;
    document.body.appendChild(mouseStyle);
}

async function cameraStreamF(id: string | null) {
    if (id) {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { deviceId: id },
        });
        videoEl.srcObject = stream;
        videoEl.play();
        if (store.get("录屏.摄像头.镜像"))
            videoEl.style.transform = "rotateY(180deg)";

        videoEl.oncanplay = () => {
            cEl.style({ display: "" });
            initSeg();
        };
    } else {
        const src = videoEl.srcObject;
        if (src instanceof MediaStream) {
            try {
                src.getVideoTracks()[0].stop();
            } catch (e) {}
        }
        videoEl.srcObject = null;
        cEl.style({ display: "none" });
    }
}

async function getAndSetStream() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoL = devices.filter((i) => i.kind === "videoinput");
    cameraSelect.setList(
        videoL.map((i) => ({
            name: i.label,
            value: i.deviceId,
        })),
    );
    if (videoL.length > 1) {
        cameraSelect.el.style({ display: "" });
    } else cameraSelect.el.style({ display: "none" });
    if (videoL.length > 0) {
        const id =
            videoL.find((i) => i.deviceId === store.get("录屏.摄像头.设备"))
                ?.deviceId ?? videoL[0].deviceId;
        cameraSelect.el.sv(id);
        return id;
    }
    return null;
}

let seg: typeof import("esearch-seg");

async function initSeg() {
    const bgSetting = store.get("录屏.摄像头.背景");
    if (bgSetting.模式 === "none") {
        return;
    }
    const path = require("node:path") as typeof import("path");
    videoEl.style.display = "";
    segEl.clear();
    videoEl.style.display = "none";
    cameraCanvas = document.createElement("canvas");
    segCanvas = document.createElement("canvas");
    const bgEl = document.createElement("div");
    if (bgSetting.模式 === "img" || bgSetting.模式 === "video") {
        const bg =
            bgSetting.模式 === "img"
                ? document.createElement("img")
                : document.createElement("video");
        const url =
            bgSetting.模式 === "img" ? bgSetting.imgUrl : bgSetting.videoUrl;
        bg.src = url;
        bgEl.append(bg);
        bgEl.style.objectFit = bgSetting.fit;
        cameraCanvas.style.display = "none";
    }
    if (bgSetting.模式 === "blur") {
        cameraCanvas.style.filter = `blur(${bgSetting.模糊}px)`;
        cameraCanvas.style.display = "";
    }
    if (bgSetting.模式 === "hide") {
        cameraCanvas.style.display = "none";
    }
    segEl.add([cameraCanvas, bgEl, segCanvas]);
    seg = require("esearch-seg") as typeof import("esearch-seg");
    await seg.init({
        segPath: path.join(__dirname, "../../assets/onnx/seg", "seg.onnx"),
        ort: require("onnxruntime-node"),
        ortOption: {
            executionProviders: [{ name: store.get("AI.运行后端") || "cpu" }],
        },
        shape: [256, 144],
        invertOpacity: true,
        threshold: 0.7,
    });
    drawCamera();
    segEl.style({
        aspectRatio: `auto ${videoEl.videoWidth} / ${videoEl.videoHeight}`,
    });
}

function drawCamera() {
    const canvasCtx = cameraCanvas.getContext("2d")!;
    const segCtx = segCanvas.getContext("2d")!;
    cameraCanvas.width = videoEl.videoWidth;
    cameraCanvas.height = videoEl.videoHeight;
    canvasCtx.drawImage(videoEl, 0, 0, cameraCanvas.width, cameraCanvas.height);
    seg.seg(
        canvasCtx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height),
    ).then((data) => {
        segCanvas.width = data.width;
        segCanvas.height = data.height;
        segCtx.putImageData(data, 0, 0);
    });
    setTimeout(() => {
        if (videoEl.srcObject) drawCamera();
    }, 10);
}

function iconEl(src: IconType) {
    return image(getImgUrl(`${src}.svg`), "icon").class("icon");
}

initStyle(store);

pack(document.body)
    .style({
        overflow: "hidden",
    })
    .class(Class.mono);

const rectEl = view().addInto().attr({ id: "recorder_rect" }).style({
    width: "100vw",
    height: "calc(100vh - 24px)",
    position: "relative",
});
const rb = view().addInto(rectEl).attr({ id: "recorder_bar" });
const keysEl = view().addInto(rb).attr({ id: "recorder_key" }).el;
const mouseKey = {
    left: view(),
    center: view(),
    right: view(),
};
const recorderMouseEl = view()
    .addInto()
    .attr({ id: "mouse_c" })
    .class("mouse")
    .add([mouseKey.left, mouseKey.center, mouseKey.right]).el;

const cEl = view()
    .addInto()
    .style({ position: "fixed", left: 0, top: 0, width: "100px" });

// todo 记忆

const videoEl = ele("video").addInto(cEl).el;
const segEl = view()
    .attr({ id: "seg" })
    .addInto(cEl)
    .class(
        addClass(
            { position: "relative", overflow: "hidden" },
            { "&>*": { position: "absolute", top: 0, width: "100%" } },
        ),
    );
const cameraSelect = dynamicSelect();
cEl.class(Class.smallSize).add(cameraSelect.el.style({ display: "none" }));
cameraSelect.el.on("change", async () => {
    const id = cameraSelect.el.gv;
    cameraStreamF(id);
    store.set("录屏.摄像头.设备", id);
});

let cameraCanvas: HTMLCanvasElement = document.createElement("canvas");
let segCanvas: HTMLCanvasElement = document.createElement("canvas");

const stop = button(iconEl("stop_record").style({ filter: "none" })).on(
    "click",
    () => {
        renderSend("recordState", ["stop"]);
    },
);
const pause = button(iconEl("play_pause")).on("click", () => {
    renderSend("recordState", ["pause"]);
});
const timeEl = txt().class(Class.textItem);
const controlBar = view("x")
    .class(Class.smallSize, Class.screenBar)
    .add([stop, pause, timeEl])
    .addInto()
    .style({
        position: "fixed",
        bottom: 0,
        right: 0,
        borderRadius: cssVar("o-padding"),
    });

initRecord();

navigator.mediaDevices.ondevicechange = async () => {
    const id = await getAndSetStream();
    cameraStreamF(id);
};

trackPoint(cEl, {
    start: () => {
        const r = cEl.el.getBoundingClientRect();
        return { x: r.left, y: r.top };
    },
    ing: (p) => {
        cEl.style({ left: `${p.x}px`, top: `${p.y}px` });
    },
});

cEl.on("wheel", (e) => {
    const r = cEl.el.getBoundingClientRect();
    cEl.style({ width: `${r.width * (1 + e.deltaY / 600)}px` });
});

renderOn("recordMouse", ([x, y]) => {
    recorderMouseEl.style.left = `${x}px`;
    recorderMouseEl.style.top = `${y}px`;
    const l = document.elementsFromPoint(x, y);
    renderSend("windowIgnoreMouse", [
        !(l.includes(cEl.el) || l.includes(controlBar.el)),
    ]);
});

renderOn("recordTime", ([t]) => {
    timeEl.sv(t);
});
renderOn("recordCamera", async ([b]) => {
    if (b) {
        const id = await getAndSetStream();
        cameraStreamF(id);
    } else {
        cameraStreamF(null);
    }
});
