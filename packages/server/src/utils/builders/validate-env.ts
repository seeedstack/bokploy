import { parse } from "yaml";
import type { ResolveOptions } from "../docker/env-resolver";
import { resolveEnvironment } from "../docker/env-resolver";

interface ComposeVarRef {
	name: string;
	required: boolean;
	hasDefault: boolean;
}

interface ValidationResult {
	missingRequired: string[];
	missingOptional: string[];
	reservedOverrides: string[];
}

const VAR_PATTERN =
	/\$\{(?<name>[a-zA-Z_][a-zA-Z0-9_]*)(?::[-?](?<default>[^}]*))?\}/g;

export const extractComposeVarRefs = (yamlContent: string): ComposeVarRef[] => {
	const refs: ComposeVarRef[] = [];
	const seen = new Set<string>();

	for (const match of yamlContent.matchAll(VAR_PATTERN)) {
		const name = match.groups?.name;
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const fullMatch = match[0];
		const hasDefault = fullMatch.includes(":-");
		const required = fullMatch.includes(":?");

		refs.push({ name, required, hasDefault });
	}

	return refs;
};

const getSatisfiedKeysFromCompose = (yamlContent: string): Set<string> => {
	const satisfied = new Set<string>();
	try {
		const doc = parse(yamlContent);
		if (!doc || typeof doc !== "object") return satisfied;

		const services = doc.services as Record<string, any> | undefined;
		if (!services) return satisfied;

		for (const serviceDef of Object.values(services)) {
			if (!serviceDef || typeof serviceDef !== "object") continue;

			const env = serviceDef.environment;
			if (env && typeof env === "object") {
				for (const key of Object.keys(env)) {
					satisfied.add(key);
				}
			}

			const envFile = serviceDef.env_file;
			if (envFile) {
				const files = Array.isArray(envFile) ? envFile : [envFile];
				for (const file of files) {
					if (typeof file === "string") {
						satisfied.add(`__env_file__${file}`);
					}
				}
			}
		}
	} catch {
		// YAML parse errors are not critical for validation
	}
	return satisfied;
};

export const validateComposeEnv = (
	yamlContent: string,
	layers: {
		organizationEnv?: string | null;
		serverEnv?: string | null;
		projectEnv?: string | null;
		environmentEnv?: string | null;
		serviceEnv?: string | null;
	},
	opts: ResolveOptions,
): ValidationResult => {
	const refs = extractComposeVarRefs(yamlContent);
	const satisfiedKeys = getSatisfiedKeysFromCompose(yamlContent);
	const resolved = resolveEnvironment(layers, opts);
	const resolvedKeys = new Set(resolved.map((v) => v.key));

	const missingRequired: string[] = [];
	const missingOptional: string[] = [];
	const reservedOverrides: string[] = resolved
		.filter((v) => v.reserved)
		.map((v) => v.key);

	for (const ref of refs) {
		if (ref.hasDefault) continue;
		if (satisfiedKeys.has(ref.name)) continue;
		if (resolvedKeys.has(ref.name)) continue;

		if (ref.required) {
			missingRequired.push(ref.name);
		} else {
			missingOptional.push(ref.name);
		}
	}

	return { missingRequired, missingOptional, reservedOverrides };
};
