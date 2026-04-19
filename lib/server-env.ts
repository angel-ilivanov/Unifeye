import "server-only";

function assertServerEnvName(name: string) {
  if (name.startsWith("NEXT_PUBLIC_")) {
    throw new Error(
      `Server secrets must not use the NEXT_PUBLIC_ prefix: ${name}`,
    );
  }
}

export function readOptionalServerEnv(name: string) {
  assertServerEnvName(name);

  const value = process.env[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function readRequiredServerEnv(name: string) {
  const value = readOptionalServerEnv(name);

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function readFirstDefinedServerEnv(...names: string[]) {
  for (const name of names) {
    const value = readOptionalServerEnv(name);

    if (value) {
      return value;
    }
  }

  return undefined;
}
