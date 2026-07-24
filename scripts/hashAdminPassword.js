import bcrypt from "bcrypt";

const readHidden = () =>
  new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("Este comando requiere una terminal interactiva."));
      return;
    }

    const characters = [];
    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(characters.join(""));
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Operación cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          characters.pop();
          continue;
        }
        if (character >= " ") characters.push(character);
      }
    };

    process.stdout.write("Contraseña del administrador: ");
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });

try {
  let password = await readHidden();
  if (password.length < 8 || password.length > 128) {
    throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
  }
  const hash = await bcrypt.hash(password, 12);
  password = "";
  process.stdout.write(`${hash}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
