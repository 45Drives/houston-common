export namespace Download {
  export function url(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    const event = new MouseEvent("click", {
      view: window,
      bubbles: false,
      cancelable: true,
    });
    a.dispatchEvent(event);
    document.body.removeChild(a);
  }

  export function blobParts(
    content: BlobPart[],
    filename: string,
    type: string = "application/octet-stream"
  ) {
    const f = new window.File(content, filename, {
      type,
    });
    file(f);
  }

  export function file(f: InstanceType<typeof window.File>) {
    const url = URL.createObjectURL(f);
    if (Object.hasOwnProperty.call(window, "chrome")) {
      // chromium based
      Download.url(url, f.name);
    } else {
      window.open(url, "_blank")?.focus(); // non-chromium based
    }
  }

  export function text(content: string, filename: string) {
    return blobParts([content], filename, "text/plain");
  }

  export function binary(content: BufferSource, filename: string) {
    return blobParts([content], filename, "application/octet-stream");
  }
}
