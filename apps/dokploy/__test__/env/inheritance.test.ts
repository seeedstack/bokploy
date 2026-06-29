import {
	extractComposeVarRefs,
	maskResolvedVars,
	resolveEnvironment,
	validateComposeEnv,
} from "@dokploy/server";
import { describe, expect, it } from "vitest";

const ON = { inheritance: true, includeServer: true };
const OFF = { inheritance: false, includeServer: true };

const byKey = (vars: { key: string; value: string }[]) =>
	Object.fromEntries(vars.map((v) => [v.key, v.value]));

describe("resolveEnvironment — inheritance OFF (backward compat)", () => {
	it("emits only service vars, ignores higher scopes as values", () => {
		const out = resolveEnvironment(
			{
				organizationEnv: "DATABASE_URL=global",
				serverEnv: "SRV=1",
				projectEnv: "JWT_SECRET=proj",
				environmentEnv: "SMTP_HOST=env",
				serviceEnv: "PORT=3000",
			},
			OFF,
		);
		expect(byKey(out)).toEqual({ PORT: "3000" });
	});

	it("still resolves ${{project.X}} references", () => {
		const out = resolveEnvironment(
			{ projectEnv: "BASE=proj", serviceEnv: "URL=${{project.BASE}}/x" },
			OFF,
		);
		expect(byKey(out)).toEqual({ URL: "proj/x" });
	});
});

describe("resolveEnvironment — inheritance ON", () => {
	it("merges all scopes with documented precedence, service wins", () => {
		const out = resolveEnvironment(
			{
				organizationEnv: "DATABASE_URL=global\nA=1",
				serverEnv: "A=2",
				projectEnv: "JWT_SECRET=proj\nA=3",
				environmentEnv: "SMTP_HOST=env\nA=4",
				serviceEnv: "PORT=3000\nDATABASE_URL=override\nA=5",
			},
			ON,
		);
		expect(byKey(out)).toEqual({
			DATABASE_URL: "override",
			JWT_SECRET: "proj",
			SMTP_HOST: "env",
			PORT: "3000",
			A: "5",
		});
	});

	it("precedence order org < server < project < environment < service", () => {
		const out = resolveEnvironment(
			{
				organizationEnv: "K=org",
				serverEnv: "K=server",
				projectEnv: "K=project",
				environmentEnv: "K=environment",
				serviceEnv: "",
			},
			ON,
		);
		expect(byKey(out).K).toBe("environment");
	});

	it("tracks origin and overriddenFrom", () => {
		const out = resolveEnvironment(
			{ organizationEnv: "K=org", projectEnv: "K=proj", serviceEnv: "K=svc" },
			ON,
		);
		const k = out.find((v) => v.key === "K");
		expect(k?.origin).toBe("service");
		expect(k?.overriddenFrom).toEqual(["organization", "project"]);
	});

	it("keeps empty values (override to empty)", () => {
		const out = resolveEnvironment(
			{ projectEnv: "K=value", serviceEnv: "K=" },
			ON,
		);
		expect(byKey(out).K).toBe("");
	});
});

describe("server scope isolation", () => {
	it("server vars excluded when includeServer false", () => {
		const out = resolveEnvironment(
			{ serverEnv: "SECRET_TOKEN=abc", serviceEnv: "PORT=1" },
			{ inheritance: true, includeServer: false },
		);
		expect(byKey(out).SECRET_TOKEN).toBeUndefined();
	});

	it("server vars included when includeServer true", () => {
		const out = resolveEnvironment(
			{ serverEnv: "REGION=eu", serviceEnv: "PORT=1" },
			ON,
		);
		expect(byKey(out).REGION).toBe("eu");
	});

	it("service overrides server (infra never clobbers explicit config)", () => {
		const out = resolveEnvironment(
			{ serverEnv: "PORT=9999", serviceEnv: "PORT=3000" },
			ON,
		);
		expect(byKey(out).PORT).toBe("3000");
	});
});

describe("secret isolation", () => {
	it("project A vars never resolve into project B (separate calls)", () => {
		const a = resolveEnvironment(
			{ projectEnv: "SECRET=projectA", serviceEnv: "" },
			ON,
		);
		const b = resolveEnvironment(
			{ projectEnv: "SECRET=projectB", serviceEnv: "" },
			ON,
		);
		expect(byKey(a).SECRET).toBe("projectA");
		expect(byKey(b).SECRET).toBe("projectB");
	});
});

describe("reserved variables", () => {
	it("flags reserved keys", () => {
		const out = resolveEnvironment({ serviceEnv: "PATH=/x\nMY_VAR=1" }, ON);
		expect(out.find((v) => v.key === "PATH")?.reserved).toBe(true);
		expect(out.find((v) => v.key === "MY_VAR")?.reserved).toBe(false);
	});
});

describe("maskResolvedVars", () => {
	it("masks secret-looking keys, keeps others", () => {
		const masked = maskResolvedVars(
			resolveEnvironment({ serviceEnv: "DB_PASSWORD=hunter2\nPORT=3000" }, ON),
		);
		expect(byKey(masked).DB_PASSWORD).toBe("••••••••");
		expect(byKey(masked).PORT).toBe("3000");
	});
});

describe("validateComposeEnv", () => {
	const compose = `
services:
  app:
    image: x
    environment:
      - PORT=\${PORT:?port required}
      - DB=\${DATABASE_URL}
      - HOST=\${HOSTNAME:-localhost}
`;

	it("blocks when required var unresolved", () => {
		const res = validateComposeEnv(compose, { serviceEnv: "" }, ON);
		expect(res.missingRequired).toContain("PORT");
	});

	it("warns (not blocks) on optional unresolved var", () => {
		const res = validateComposeEnv(compose, { serviceEnv: "PORT=1" }, ON);
		expect(res.missingRequired).toEqual([]);
		expect(res.missingOptional).toContain("DATABASE_URL");
	});

	it("inline default counts as satisfied", () => {
		const res = validateComposeEnv(compose, { serviceEnv: "PORT=1" }, ON);
		expect(res.missingOptional).not.toContain("HOSTNAME");
	});

	it("required var satisfied by inherited project scope", () => {
		const res = validateComposeEnv(
			compose,
			{ projectEnv: "PORT=8080", serviceEnv: "" },
			ON,
		);
		expect(res.missingRequired).toEqual([]);
	});
});

describe("extractComposeVarRefs", () => {
	it("classifies required vs optional vs default", () => {
		const refs = extractComposeVarRefs("a=${REQ:?msg} b=${OPT} c=${DEF:-x}");
		expect(refs.find((r) => r.name === "REQ")?.required).toBe(true);
		expect(refs.find((r) => r.name === "OPT")?.required).toBe(false);
		expect(refs.find((r) => r.name === "DEF")?.hasDefault).toBe(true);
	});
});
