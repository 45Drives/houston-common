import { BashCommand, Command, ExitedProcess, server, unwrap } from "@/index";
import { suite, test, expect } from "vitest";

suite("Process", () => {
  test("simple execution", async () => {
    const trueCmd = new Command(["true"]);
    const falseCmd = new Command(["false"]);
    expect(await unwrap(server.execute(trueCmd))).toEqual(
      new ExitedProcess(server, trueCmd, 0, new Uint8Array(), "")
    );
    expect(await unwrap(server.execute(falseCmd, false))).toEqual(
      new ExitedProcess(server, falseCmd, 1, new Uint8Array(), "")
    );
  });
  test("output", async () => {
    expect(
      (await unwrap(server.execute(new Command(["echo", "Hello, world!"])))).getStdout()
    ).toEqual("Hello, world!\n");
    expect(
      (await unwrap(server.execute(new BashCommand("echo 'Hello, world!' >&2")))).getStderr()
    ).toEqual("Hello, world!\n");
    expect(
      (
        await unwrap(server.execute(new Command(["printf", "\\x00\\x01\\x02\\x03\\x04"])))
      ).getStdout(true)
    ).toEqual(new Uint8Array([0, 1, 2, 3, 4]));
    expect(
      (
        await unwrap(server.execute(new Command(["dd", "if=/dev/zero", "bs=1M", "count=3"])))
      ).getStdout(true)
    ).toHaveLength(3 * 1024 ** 2);
  });
  test("input", async () => {
    const proc = server.spawnProcess(new Command(["cat"]));

    proc.write("Hello, world!");

    expect((await unwrap(proc.wait())).getStdout()).toEqual("Hello, world!");

    proc.execute();

    const binaryInput = new Uint8Array([0, 1, 2, 3, 4]);

    proc.write(binaryInput);

    expect((await unwrap(proc.wait())).getStdout(true)).toEqual(binaryInput);
  });
  test("streaming", async () => {
    const proc = server.spawnProcess(new Command(["cat"]));

    const promise = new Promise<string>((resolve) => {
      proc.stream((output) => {
        resolve(output);
      });
    });

    proc.write("Hello, world!", true);

    expect(await promise).toEqual("Hello, world!");

    const binaryInput = new Uint8Array([0, 1, 2, 3, 4]);

    const promiseBin = new Promise<Uint8Array>((resolve) => {
      proc.streamBinary((output) => {
        resolve(output);
      });
    });

    proc.write(binaryInput, true);

    expect(await promiseBin).toEqual(binaryInput);

    proc.close();

    const exited = await unwrap(proc.wait());

    expect(exited.exitStatus).toEqual(0);

    expect(exited.getStdout()).toEqual("");
  });
  test("exit status", async () => {
    const proc = await unwrap(
      server.execute(
        new BashCommand("echo 'Hello, world!'; echo 'Goodbye, world!' >&2; exit 2"),
        false
      )
    );
    expect(proc.exitStatus).toEqual(2);
    expect(proc.getStdout()).toEqual("Hello, world!\n");
    expect(proc.getStderr()).toEqual("Goodbye, world!\n");
  });
  test("throw on error", () => {
    expect(unwrap(server.execute(new BashCommand("exit 1")))).rejects.toThrow();
  })
});
