import { CancelledByUser } from "@/errors";
import { ResultAsync, ok, err } from "neverthrow";

export namespace Upload {
  export type Options = { accept?: string; multiple?: boolean };

  export function file(accept?: string) {
    return getUpload({ multiple: false, accept }).andThen(([file]) =>
      file === undefined ? err(new Error("No file given")) : ok(file)
    );
  }

  export function files(accept?: string) {
    return getUpload({ multiple: true, accept });
  }

  export function text(accept?: string) {
    return file(accept).andThen((file) => ResultAsync.fromSafePromise(file.text()));
  }

  export function binary(accept?: string) {
    return file(accept).andThen((file) => ResultAsync.fromSafePromise(file.arrayBuffer()));
  }

  function getUpload(options: Options = {}): ResultAsync<FileList, CancelledByUser> {
    const promise = new Promise<FileList>((resolve, reject) => {
      fakeUploadClick(resolve, reject, options);
    });
    return ResultAsync.fromPromise(promise, (e) =>
      e instanceof CancelledByUser
        ? e
        : e instanceof Error
          ? e
          : new Error(`Error while uploading: ${e}`)
    );
  }

  function fakeUploadClick(
    resolver: (files: FileList) => void,
    rejecter: (e: CancelledByUser) => void,
    options: Options & { multiple?: boolean }
  ) {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    input.hidden = true;
    input.multiple = options.multiple ?? input.multiple;
    input.accept = options.accept ?? input.accept;
    input.addEventListener("change", ({ target }: Event) => {
      if (target instanceof HTMLInputElement && target.files && target.files.length > 0) {
        resolver(target.files);
        document.body.removeChild(input);
      }
    });
    input.addEventListener("cancel", () => {
      rejecter(new CancelledByUser());
      document.body.removeChild(input);
    });
    document.body.appendChild(input);
    const event = new MouseEvent("click", {
      view: window,
      bubbles: false,
      cancelable: true,
    });
    input.dispatchEvent(event);
  }
}
