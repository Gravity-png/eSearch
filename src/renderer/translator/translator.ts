import initScreenShots from "../screenShot/screenShot";

import xtranslator from "xtranslator";

import { addClass, button, type ElType, image, pack, view } from "dkh-ui";

function iconEl(src: IconType) {
    return image(getImgUrl(`${src}.svg`), "icon").class("icon");
}

import store from "../../../lib/store/renderStore";
import { Class, getImgUrl, initStyle, setTitle } from "../root/root";
import { t } from "../../../lib/translate/translate";
import { renderOn, renderSend } from "../../../lib/ipc";
import type { IconType } from "../../iconTypes";
import { defaultOcrId, loadOCR } from "../ocr/ocr";

initStyle(store);

setTitle(t("屏幕翻译"));

const screenShots = initScreenShots({
    c: store.get("额外截屏器.命令"),
    path: store.get("额外截屏器.位置"),
});

const transE = store.get("翻译.翻译器");

let translateE = async (input: string[]) => input;

if (transE.length > 0) {
    const x = transE[0];
    const e = xtranslator.getEngine(x.type);
    if (e) {
        e.setKeys(x.keys);
        const lan = store.get("屏幕翻译.语言");
        translateE = (input: string[]) =>
            e.run(
                input,
                (lan.from ||
                    "auto") as (typeof xtranslator.languages.normal)[number],
                (lan.to ||
                    store.get(
                        "语言.语言",
                    )) as (typeof xtranslator.languages.normal)[number],
            );
    }
}

type Rect = { x: number; y: number; w: number; h: number };
let rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

let screenId = Number.NaN;

let display: Electron.Display[];

const frequencyTime: number = store.get("屏幕翻译.dTime") || 3000;

let pause = false;

function screenshot(id: number, rect: Rect) {
    const l = screenShots(display).screen;
    const screen = l.find((i) => i.id === id) || l[0];
    if (!screen) return null;
    const img = screen.capture().toImageData();
    if (!img) return null;
    const canvas = document.createElement("canvas");

    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("can get canvas context");
    ctx.putImageData(img, 0, 0);
    return ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
}

const tCache: Map<string, string> = new Map();

async function translate(text: { text: string; el: ElType<HTMLDivElement> }[]) {
    const toTran: typeof text = [];
    for (const i of text) {
        const t = tCache.get(i.text);
        if (t) {
            i.el.el.innerText = t;
        } else {
            toTran.push(i);
        }
    }

    const tt = await translateE(toTran.map((i) => i.text));
    for (let i = 0; i < tt.length; i++) {
        const tran = tt[i];
        const text = toTran[i].text;
        tCache.set(text, tran);
        toTran[i].el.el.innerText = tran;
    }
}

const sl = () =>
    new Promise((resolve) => {
        setTimeout(() => {
            resolve("");
        }, 100);
    });

async function run() {
    if (!OCR) return;
    const data = screenshot(screenId, rect);
    if (!data) return;
    document.body.style.opacity = "1";

    const ocrData = await OCR.ocr(data);

    textEl.clear();
    const textL: { text: string; el: ElType<HTMLDivElement> }[] = [];
    for (const _i of ocrData.columns.flatMap((c) => c.parragraphs)) {
        const lineHeight = _i.src
            .map((i) => i.box[3][1] - i.box[0][1])
            .reduce((a, b) => (a + b) / 2);
        const i = _i.parse;
        const text = i.text;
        const x0 = i.box[0][0];
        const y0 = i.box[0][1];
        const x1 = i.box[2][0];
        const y1 = i.box[2][1];
        const item = view().style({
            position: "absolute",
            left: `${x0}px`,
            top: `${y0}px`,
            width: `${x1 - x0}px`,
            height: `${y1 - y0}px`,
            lineHeight: `${lineHeight}px`,
            fontSize: `${lineHeight}px`,
            // todo 字体颜色
        });
        textEl.add(item);
        textL.push({ el: item, text });
    }
    translate(textL);
}

const runRun = () => {
    if (!pause) {
        run();
        setTimeout(runRun, frequencyTime);
    }
};

pack(document.body).style({
    overflow: "hidden",
});

const playIcon = iconEl("pause");
const playEl = button(playIcon).on("click", () => {
    pause = !pause;
    playIcon.el.src = pause ? getImgUrl("recume.svg") : getImgUrl("pause.svg");
    runRun();
});

const runEl = button(iconEl("ocr")).on("click", async () => {
    mainEl.el.style.opacity = "0";
    await sl();
    await sl();
    await run();
    mainEl.el.style.opacity = "1";
});

const toolsEl = view("x")
    .style({ position: "absolute", right: 0, top: 0 })
    .class(
        addClass(
            {},
            {
                "&>*": {
                    // @ts-ignore
                    "-webkit-app-region": "no-drag",
                },
            },
        ),
    )
    .class(Class.smallSize, Class.screenBar)
    .add([
        playEl,
        runEl,
        button(iconEl("close")).on("click", () =>
            renderSend("windowClose", []),
        ),
    ]);

let OCR: Awaited<ReturnType<typeof import("esearch-ocr").init>> | null = null;

const ocrX = loadOCR(store, store.get("OCR.类型") || defaultOcrId);

OCR = ocrX ? await ocrX.ocr.init(ocrX.config) : null;

const mainEl = view().style({
    position: "absolute",
    overflow: "hidden",
    width: "100vw",
    height: "100vh",
});
const textEl = view().style({
    position: "relative",
    // @ts-ignore
    "-webkit-app-region": "drag",
    width: "100vw",
    height: "100vh",
});
mainEl.add([textEl]);

mainEl.addInto();

mainEl.add(toolsEl);

renderOn("translatorInit", ([id, _display, _rect]) => {
    display = _display;
    screenId = id;
    rect = _rect;
    runRun();
});
