import { hasValidLicense } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("hasValidLicense", () => {
	it("treats every self-hosted install as licensed (no license server to check)", async () => {
		// IS_CLOUD is false in this test env (see vitest.config.ts `define`),
		// so this must short-circuit before touching the (mocked, empty) DB.
		await expect(hasValidLicense("any-org-id")).resolves.toBe(true);
	});
});
