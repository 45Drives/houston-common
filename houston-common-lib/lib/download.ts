export namespace Download {
  export function url(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    a.download = filename;
    document.body.appendChild(a);
    const event = new MouseEvent("click", {
      view: window,
      bubbles: false,
      cancelable: true,
    });
    a.dispatchEvent(event);
    document.body.removeChild(a);
  }

  export function content(content: BlobPart[], filename: string) {
    const object = new File(content, filename, {
      type: "application/octet-stream",
    });
    Download.url(URL.createObjectURL(object), filename);
  }
}