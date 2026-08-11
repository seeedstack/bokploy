import { dirname, join } from "node:path";
import { encodeBase64, prepareEnvironmentVariables } from "../docker/utils";
import type { EnvExtra } from "../docker/utils";

export const createEnvFileCommand = (
	directory: string,
	env: string | null,
	projectEnv?: string | null,
	environmentEnv?: string | null,
	extra?: EnvExtra,
) => {
	const envFileContent = prepareEnvironmentVariables(
		env,
		projectEnv,
		environmentEnv,
		extra,
	).join("\n");

	const encodedContent = encodeBase64(envFileContent || "");
	const envFilePath = join(dirname(directory), ".env");

	return `echo "${encodedContent}" | base64 -d > "${envFilePath}";`;
};
