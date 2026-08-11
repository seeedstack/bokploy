import { RESERVED_ENV_KEYS } from "@dokploy/server/constants";
import { parse } from "dotenv";

export type EnvScope =
	| "organization"
	| "server"
	| "project"
	| "environment"
	| "service";

export interface ResolvedVar {
	key: string;
	value: string;
	origin: EnvScope;
	overriddenFrom: EnvScope[];
	reserved: boolean;
}

export interface ResolveOptions {
	inheritance: boolean;
	includeServer: boolean;
	base?: "env" | "buildArgs";
}

interface EnvLayers {
	organizationEnv?: string | null;
	serverEnv?: string | null;
	projectEnv?: string | null;
	environmentEnv?: string | null;
	serviceEnv?: string | null;
}

const SCOPE_ORDER: EnvScope[] = [
	"organization",
	"server",
	"project",
	"environment",
	"service",
];

const parseEnvBlock = (
	raw: string | null | undefined,
): Record<string, string> => parse(raw ?? "");

// Keep these exact strings: existing tests / users depend on them.
const REF_ERROR: Record<EnvScope, (ref: string) => string> = {
	organization: (ref) =>
		`Invalid organization environment variable: organization.${ref}`,
	server: (ref) => `Invalid server environment variable: server.${ref}`,
	project: (ref) => `Invalid project environment variable: project.${ref}`,
	environment: (ref) => `Invalid environment variable: environment.${ref}`,
	service: (ref) => `Invalid service environment variable: ${ref}`,
};

const resolveRefs = (
	value: string,
	scopes: Record<EnvScope, Record<string, string>>,
): string => {
	let resolved = value;
	for (const scope of SCOPE_ORDER) {
		resolved = resolved.replace(
			new RegExp(`\\$\\{\\{${scope}\\.(.*?)\\}\\}`, "g"),
			(_, ref: string) => {
				if (scopes[scope][ref] !== undefined) {
					return scopes[scope][ref];
				}
				throw new Error(REF_ERROR[scope](ref));
			},
		);
	}
	// Self-reference: resolve against service scope (legacy behavior).
	resolved = resolved.replace(/\$\{\{(.*?)\}\}/g, (_, ref: string) => {
		if (scopes.service[ref] !== undefined) {
			return scopes.service[ref];
		}
		throw new Error(REF_ERROR.service(ref));
	});
	return resolved;
};

export const resolveEnvironment = (
	layers: EnvLayers,
	opts: ResolveOptions,
): ResolvedVar[] => {
	const scopes: Record<EnvScope, Record<string, string>> = {
		organization: parseEnvBlock(layers.organizationEnv),
		server: parseEnvBlock(opts.includeServer ? layers.serverEnv : null),
		project: parseEnvBlock(layers.projectEnv),
		environment: parseEnvBlock(layers.environmentEnv),
		service: parseEnvBlock(layers.serviceEnv),
	};

	if (!opts.inheritance) {
		const serviceVars = scopes.service;
		return Object.entries(serviceVars).map(([key, value]) => ({
			key,
			value: resolveRefs(value, scopes),
			origin: "service" as const,
			overriddenFrom: [],
			reserved: RESERVED_ENV_KEYS.includes(key),
		}));
	}

	const merged: Map<
		string,
		{ value: string; origin: EnvScope; overriddenFrom: EnvScope[] }
	> = new Map();

	for (const scope of SCOPE_ORDER) {
		const vars = scopes[scope];
		for (const [key, rawValue] of Object.entries(vars)) {
			const resolvedValue = resolveRefs(rawValue, scopes);
			const existing = merged.get(key);
			if (existing) {
				// Record the lower scope we just overrode (loser), then promote winner.
				existing.overriddenFrom.push(existing.origin);
				existing.value = resolvedValue;
				existing.origin = scope;
			} else {
				merged.set(key, {
					value: resolvedValue,
					origin: scope,
					overriddenFrom: [],
				});
			}
		}
	}

	return Array.from(merged.entries()).map(([key, entry]) => ({
		key,
		value: entry.value,
		origin: entry.origin,
		overriddenFrom: entry.overriddenFrom,
		reserved: RESERVED_ENV_KEYS.includes(key),
	}));
};

// Shape shared by application / compose / database resources for env resolution.
export interface EnvResource {
	env?: string | null;
	buildArgs?: string | null;
	serverId?: string | null;
	server?: { env?: string | null } | null;
	environment: {
		env?: string | null;
		project: {
			env?: string | null;
			enableEnvInheritance: boolean;
			organization?: { env?: string | null } | null;
		};
	};
}

// Single entry point used by deploy paths, the effective-env view, and validation.
export const resolveResourceEnvironment = (
	resource: EnvResource,
	base: "env" | "buildArgs" = "env",
): ResolvedVar[] =>
	resolveEnvironment(
		{
			organizationEnv: resource.environment.project.organization?.env,
			serverEnv: resource.server?.env,
			projectEnv: resource.environment.project.env,
			environmentEnv: resource.environment.env,
			serviceEnv: base === "buildArgs" ? resource.buildArgs : resource.env,
		},
		{
			inheritance: resource.environment.project.enableEnvInheritance,
			// Server vars only apply when the resource is bound to a server.
			includeServer: !!resource.serverId,
			base,
		},
	);

const SECRET_KEY_PATTERN =
	/(SECRET|PASSWORD|TOKEN|PRIVATE|_KEY|APIKEY|CREDENTIAL)/i;

// Mask secret-looking values for the UI effective-env view.
export const maskResolvedVars = (vars: ResolvedVar[]): ResolvedVar[] =>
	vars.map((v) =>
		SECRET_KEY_PATTERN.test(v.key) && v.value ? { ...v, value: "••••••••" } : v,
	);
