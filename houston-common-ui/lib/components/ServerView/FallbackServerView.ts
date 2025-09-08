import type { DriveSlot } from "@45drives/houston-common-lib";

type Flag = "selected" | "highlight" | "warning" | "error" | "flashingStorage" | "flashingBackup";

type SlotState = {
    el: HTMLButtonElement;
    drive: DriveSlot["drive"];
    flags: Record<Flag, boolean>;
};

export class FallbackServerView {
    enableSelection = true;
    enableRotate = false;
    enablePan = false;
    enableZoom = false;

    onLoadingStart?: (s: string, l: number, t: number) => void;
    onLoadingProgress?: (s: string, l: number, t: number) => void;
    onLoadingEnd?: (s: string, l: number, t: number) => void;

    private parent?: HTMLElement;
    private wrap?: HTMLDivElement;
    private container?: HTMLDivElement;
    private bannerEl?: HTMLDivElement;
    private pendingBanner?: string;
    private grid?: HTMLDivElement;

    private slots: DriveSlot[] = [];
    private slotMap = new Map<string, SlotState>();
    private selected = new Set<string>();
    private listeners = new Map<string, Set<(e: any) => void>>([
        ["selectionchange", new Set()],
    ]);

    private lastColsClass = "grid-cols-3";

    start(parent: HTMLElement) {
        this.parent = parent;

        this.wrap = document.createElement("div");
        this.wrap.className = "w-full h-full grid place-items-center p-3 select-none overflow-auto";

        this.container = document.createElement("div");
        this.container.className = "flex flex-col items-center gap-2";
        this.wrap.appendChild(this.container);

        this.grid = document.createElement("div");
        this.grid.className = "grid gap-3 auto-rows-[2.75rem] justify-items-center " + this.lastColsClass;

        this.container.appendChild(this.grid);

        parent.appendChild(this.wrap);

        if (this.pendingBanner) this.setBanner(this.pendingBanner);

        this.onLoadingStart?.("Preparing generic view…", 0, 1);
        this.onLoadingProgress?.("Preparing generic view…", 1, 1);
        this.onLoadingEnd?.("Loaded.", 1, 1);
    }

    stop() {
        if (this.wrap?.parentElement) this.wrap.parentElement.removeChild(this.wrap);
        this.wrap = undefined;
        this.container = undefined;
        this.bannerEl = undefined;
        this.grid = undefined;
        this.slotMap.clear();
        this.selected.clear();
    }

    setBackground(bg: number) {
        if (!this.wrap) return;
        this.wrap.classList.toggle("bg-well");
    }

    setBanner(text: string) {
        this.pendingBanner = text;
        if (!this.container) return;

        if (!this.bannerEl) {
            this.bannerEl = document.createElement("div");
            this.bannerEl.className = "text-sm text-muted text-center";
            this.container.insertBefore(this.bannerEl, this.grid!);
        }
        this.bannerEl.textContent = text;
    }


    async setView(_: "InitialView" | "DriveView") { }
    async revealDrives() { }
    async hideDrives() { }

    addEventListener(type: "selectionchange", cb: (e: any) => void) {
        this.listeners.get(type)?.add(cb);
    }
    removeEventListener(type: "selectionchange", cb: (e: any) => void) {
        this.listeners.get(type)?.delete(cb);
    }

    private emitSelection() {
        const components = [...this.selected].map((slotId) => {
            const s = this.slots.find((x) => x.slotId === slotId);
            return { driveSlot: s ?? ({ slotId, drive: this.slotMap.get(slotId)?.drive ?? null } as DriveSlot) };
        });
        this.listeners.get("selectionchange")?.forEach((fn) =>
            fn({ type: "selectionchange", components })
        );
    }

    setDriveSlotInfo(slots: DriveSlot[]) {
        this.slots = slots.slice();
        this.render();
    }

    async setSlotHighlights(
        colorFlag: Flag | Flag[] | string | null,
        slotIds: string[],
        value: boolean = true
    ): Promise<void> {
        const known: Flag[] = [
            "selected",
            "highlight",
            "warning",
            "error",
            "flashingStorage",
            "flashingBackup",
        ];
        const flags = Array.isArray(colorFlag)
            ? (colorFlag.filter((f) => known.includes(f as Flag)) as Flag[])
            : known.includes(colorFlag as Flag)
                ? [colorFlag as Flag]
                : [];

        for (const id of slotIds) {
            const st = this.slotMap.get(id);
            if (!st) continue;
            for (const f of flags) st.flags[f] = value;
            this.applyClasses(st);
        }
    }

    private render() {
        if (!this.grid) return;

        const current = new Set(this.slots.map((s) => s.slotId));
        for (const [id, st] of [...this.slotMap]) {
            if (!current.has(id)) {
                st.el.remove();
                this.slotMap.delete(id);
                this.selected.delete(id);
            }
        }

        const count = this.slots.length || 24;
        const cols =
            count >= 36 ? 12 : count >= 24 ? 8 : count >= 12 ? 6 : count >= 8 ? 4 : 3;
        const colsClass = `grid-cols-${cols}`;
        if (colsClass !== this.lastColsClass) {
            this.grid.classList.remove(this.lastColsClass);
            this.grid.classList.add(colsClass);
            this.lastColsClass = colsClass;
        }

        for (const s of this.slots) {
            let st = this.slotMap.get(s.slotId);
            if (!st) {
                const el = document.createElement("button");
                el.type = "button";
                el.title = `Slot ${s.slotId}`;
                el.textContent = s.slotId;

                const base = [
                    "text-xs",
                    "inline-flex items-center justify-center",
                    "font-semibold",
                    "rounded-md",
                    "border-2 border-amber-400/70",
                    "h-11 min-w-[7rem] px-3",
                    "appearance-none",
                    "cursor-pointer",
                    "!bg-[#1e2f2a]",
                    "!text-[#e6fff2]",
                    "transition duration-150",
                    "hover:-translate-y-px",
                    "active:scale-95",
                ].join(" ");
                (el as any)._baseClass = base;
                el.className = base;

                el.addEventListener("mouseenter", () => {
                    st!.flags.highlight = true;
                    this.applyClasses(st!);
                });
                el.addEventListener("mouseleave", () => {
                    st!.flags.highlight = false;
                    this.applyClasses(st!);
                });

                el.addEventListener("click", () => {
                    if (!this.enableSelection) return;

                    for (const x of this.slotMap.values()) x.flags.selected = false;
                    this.selected.clear();

                    st!.flags.selected = true;
                    this.selected.add(s.slotId);

                    el.classList.add("animate-[pulse_0.6s_ease-in-out_1]");
                    setTimeout(() => el.classList.remove("animate-[pulse_0.6s_ease-in-out_1]"), 650);

                    for (const x of this.slotMap.values()) this.applyClasses(x);
                    this.emitSelection();
                });


                st = {
                    el,
                    drive: s.drive,
                    flags: {
                        selected: false,
                        highlight: false,
                        warning: false,
                        error: false,
                        flashingStorage: false,
                        flashingBackup: false,
                    },
                };
                this.slotMap.set(s.slotId, st);
                this.grid.appendChild(el);
            } else {
                st.drive = s.drive;
                st.el.textContent = s.slotId;
            }

            this.applyClasses(st)
        }
    }

    private applyClasses(st: SlotState) {
        const el = st.el;
        const base: string = (el as any)._baseClass || el.className;
        const classes: string[] = [base];

        if (st.flags.flashingStorage) {
            classes.push("!bg-[#4a1a4a]", "!text-[#ffe9ff]", "border-[#ffa2ff]");
        }
        if (st.flags.flashingBackup) {
            classes.push("!bg-[#0e3f44]", "!text-[#e8fdff]", "border-[#7ff6ff]");
        }

        if (st.flags.selected) {
            classes.push("outline", "outline-2", "outline-offset-2", "outline-lime-400");
        }

        if (st.flags.error) {
            classes.push("ring-2", "ring-red-500");
        } else if (st.flags.warning) {
            classes.push("ring-2", "ring-orange-400");
        } else if (st.flags.highlight) {
            classes.push("ring-2", "ring-white/60");
        }

        el.className = classes.join(" ");
    }

}