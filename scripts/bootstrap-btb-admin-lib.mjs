export function parseBootstrapArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (["help", "confirm", "password-stdin"].includes(key) && argv[i].startsWith("--")) args[key] = true;
    else if (["email", "name"].includes(key) && argv[i].startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) args[key] = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${argv[i]}. Use --help.`);
  }
  return args;
}

export function bootstrapIdentity(args) {
  const email = String(args.email ?? "").trim().toLowerCase();
  const name = String(args.name ?? "").trim();
  if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) || email.endsWith("@btb.demo")) throw new Error("Pass a real console --email, not a shared demo address.");
  if (!name || name.length > 100) throw new Error("Pass --name (1–100 characters).");
  return { email, name };
}
