// Request tokens share GPU resources (src/render/request-visuals.js): one
// sphere geometry for every request and one material per colour. These tests
// pin the two rules that make sharing safe — a recolour swaps the material
// instead of mutating it, and destroying a request never disposes shared
// resources another request is still drawing with.
import { describe, it, expect } from "vitest";
import { STATE } from "../../src/state.js";
import { CONFIG } from "../../src/config.js";
import { resetGame, requestGroup } from "../../game.js";
import { Request } from "../../src/entities/Request.js";
import {
    getRequestGeometry,
    getRequestMaterial,
    isSharedRequestResource,
    setRequestColor,
} from "../../src/render/request-visuals.js";

describe("request tokens share GPU resources", () => {
    it("every request uses the one shared geometry and its type's shared material", () => {
        resetGame("sandbox");
        const a = new Request("READ");
        const b = new Request("READ");
        const c = new Request("WRITE");

        expect(a.mesh.geometry).toBe(getRequestGeometry());
        expect(c.mesh.geometry).toBe(a.mesh.geometry);
        expect(b.mesh.material).toBe(a.mesh.material);
        expect(c.mesh.material).not.toBe(a.mesh.material);
        expect(a.mesh.material).toBe(getRequestMaterial(CONFIG.trafficTypes.READ.color));
        expect(isSharedRequestResource(a.mesh.material)).toBe(true);
    });

    it("recolouring one request swaps its material and leaves its peers untouched", () => {
        resetGame("sandbox");
        const a = new Request("READ");
        const b = new Request("READ");
        const before = b.mesh.material;

        setRequestColor(a, CONFIG.colors.requestFail);

        expect(a.mesh.material).toBe(getRequestMaterial(CONFIG.colors.requestFail));
        expect(b.mesh.material).toBe(before);
        expect(before.disposed).toBe(false);
    });

    it("destroying a request detaches it without disposing shared resources", () => {
        resetGame("sandbox");
        const a = new Request("READ");
        const b = new Request("READ");
        STATE.requests.push(a, b);

        a.destroy();

        expect(requestGroup.children).not.toContain(a.mesh);
        expect(requestGroup.children).toContain(b.mesh);
        expect(b.mesh.geometry.disposed).toBe(false);
        expect(b.mesh.material.disposed).toBe(false);
    });
});
