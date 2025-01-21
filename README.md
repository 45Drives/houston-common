# houston-common
Common library for Houston

## API Documentation
https://45drives.github.io/houston-common/

## Example
### Running command and processing output
```ts
import { server, Command, unwrap } from "@45drives/houston-common-lib";

function findFile(searchPath: string, filename: string): ResultAsync<string[], ProcessError> {
  return server
    .execute(new Command(["find", searchPath, "-name", filename, "-print0"]))
    .map((proc) => proc.getStdout().split("\0"));
}
const findResult = findFile("/home/user", "id_rsa.pub"); // findResult could contain either list of file paths or a ProcessError

// 1. use findResult through map method
findResult.map((filePaths: string[]) => {
  // this callback only runs if findResult was successful
  doSomethingWith(filePaths);
});

// 2. or use findResult through match
findResult.match(
  (filePaths: string[]) => {
    // this callback only runs if findResult was successful
    doSomethingWith(filePaths);
  },
  (err: ProcessError) => {
    // this callback only runs if findResult failed
    handleError(err);
  }
);

// 3. or if whatever you are doing to the result also returns a Result, use .andThen instead of .map
const rmResult = findResult.andThen((filePaths: string[]) =>
  server.execute(new Command(["rm", ...filePaths]))
);

// 4. or if you'd rather not use Result and a) throw ProcessError if the command failed
const foundPathsOrThrow: string[] = await unwrap(findResult);

// 4. b) fallback to default value if failed, ignoring error:
const foundPathsOrEmpty: string[] = await findResult.unwrapOr([]);
```
