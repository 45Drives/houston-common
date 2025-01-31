export default function resizeHook(
  p5: any,
  cnv_id: string,
  max_w: number,
  parentContainer: string | null = null
) {
  p5.canvas_id = cnv_id;
  p5.max_w = max_w;
  p5.parentContainer = parentContainer
    ? document.getElementById(parentContainer)
    : document.body;

  p5.windowResized = () => {
    const cnv = document.getElementById(p5.canvas_id) as HTMLElement | null;
    if (cnv && p5.parentContainer) {
      cnv.style.width = `${Math.min(
        p5.int((p5.parentContainer as HTMLElement).clientWidth - 60),
        p5.int(p5.max_w)
      )}px`;
      cnv.style.height = "auto";
    }
  };

  p5.isOverflown = (cnv: HTMLElement, parent: HTMLElement): boolean => {
    return cnv.clientWidth > parent.clientWidth;
  };

  p5.setInitSize = () => {
    const cnv = document.getElementById(p5.canvas_id) as HTMLElement | null;
    if (cnv && p5.parentContainer) {
      cnv.style.width = `${p5.int(p5.max_w)}px`;
      cnv.style.height = "auto";
      if (p5.isOverflown(cnv, p5.parentContainer as HTMLElement)) {
        cnv.style.width = `${Math.min(
          p5.int((p5.parentContainer as HTMLElement).clientWidth - 60),
          p5.int(p5.max_w)
        )}px`;
        cnv.style.height = "auto";
      }
    }
  };

  p5.setInitSize();
}
