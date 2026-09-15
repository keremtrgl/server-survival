// Topology tests over the REAL modules (#155 PR 10, tier 2): the valid-edge
// table, the reverse-edge block (#191/#192), placement economics, deletion
// with refund + orphaned-request cleanup, and grid snapping.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createConnection,
  deleteConnection,
  deleteObject,
  snapToGrid,
} from "../../src/sim/topology.js";
import { createService } from "../../src/sim/topology.js";
import { Request } from "../../src/entities/Request.js";
import { i18n } from "../../src/i18n.js";
import { STATE, CONFIG, resetWorld, place, connect } from "../helpers/sim-world.mjs";
import { raycastHits, resetRaycastHits } from "../helpers/three-stub.mjs";

beforeEach(() => resetWorld());
afterEach(resetRaycastHits);

function tryEdge(fromType, toType) {
  const from = fromType === "internet" ? STATE.internetNode : place(fromType);
  const to = place(toType);
  const fromId = fromType === "internet" ? "internet" : from.id;
  createConnection(fromId, to.id);
  return from.connections.includes(to.id);
}

describe("valid-edge table — allowed pairs", () => {
  it.each([
    ["internet", "waf"],
    ["internet", "alb"],
    ["internet", "cdn"],
    ["internet", "apigw"],
    ["waf", "alb"],
    ["waf", "sqs"],
    ["waf", "apigw"],
    ["alb", "sqs"],
    ["sqs", "alb"],
    ["sqs", "compute"],
    ["alb", "compute"],
    ["compute", "cache"],
    ["compute", "db"],
    ["compute", "s3"],
    ["compute", "nosql"],
    ["compute", "search"],
    ["compute", "replica"],
    ["cache", "db"],
    ["cache", "s3"],
    ["cache", "nosql"],
    ["cache", "replica"],
    ["cdn", "s3"],
    ["apigw", "alb"],
    ["apigw", "sqs"],
    ["apigw", "compute"],
    ["replica", "db"],
    ["replica", "nosql"],
    ["alb", "serverless"],
    ["sqs", "serverless"],
    ["apigw", "serverless"],
    ["serverless", "db"],
    ["serverless", "cache"],
    ["serverless", "s3"],
    ["serverless", "replica"],
  ])("%s -> %s is allowed", (a, b) => {
    expect(tryEdge(a, b)).toBe(true);
  });
});

describe("valid-edge table — rejected pairs", () => {
  it.each([
    ["db", "compute"],
    ["compute", "alb"],
    ["compute", "waf"],
    ["alb", "db"],
    ["waf", "db"],
    ["cache", "compute"],
    ["s3", "db"],
    ["cdn", "db"],
    ["replica", "s3"],
    ["serverless", "alb"],
    ["internet", "compute"],
    ["internet", "db"],
  ])("%s -> %s is rejected", (a, b) => {
    expect(tryEdge(a, b)).toBe(false);
  });

  it("self-connection is a no-op", () => {
    const alb = place("alb");
    expect(createConnection(alb.id, alb.id)).toEqual({
      ok: false,
      reasonKey: "connection_same_node",
    });
    expect(alb.connections).toHaveLength(0);
    expect(STATE.connections).toHaveLength(0);
  });

  it("returns a reason and does not mutate state for a missing endpoint", () => {
    const alb = place("alb");
    expect(createConnection(alb.id, "missing")).toEqual({
      ok: false,
      reasonKey: "connection_endpoint_missing",
    });
    expect(alb.connections).toHaveLength(0);
    expect(STATE.connections).toHaveLength(0);
  });

  it("returns a reason and does not mutate state for a duplicate edge", () => {
    const from = place("alb");
    const to = place("sqs");
    expect(createConnection(from.id, to.id)).toEqual({ ok: true });
    expect(createConnection(from.id, to.id)).toEqual({
      ok: false,
      reasonKey: "connection_duplicate",
    });
    expect(from.connections.filter((c) => c === to.id)).toHaveLength(1);
    expect(STATE.connections).toHaveLength(1);
  });

  it("returns a reason and does not mutate state for an invalid edge", () => {
    const from = place("db");
    const to = place("compute");
    expect(createConnection(from.id, to.id)).toEqual({
      ok: false,
      reasonKey: "invalid_topology_detailed",
    });
    expect(from.connections).toHaveLength(0);
    expect(STATE.connections).toHaveLength(0);
  });
});

describe("reverse-edge block (#191/#192)", () => {
  it("sqs->alb is rejected when alb->sqs already exists (request loop guard)", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    expect(createConnection(alb.id, sqs.id)).toEqual({ ok: true });
    expect(createConnection(sqs.id, alb.id)).toEqual({
      ok: false,
      reasonKey: "connection_reverse",
    });
    expect(alb.connections).toContain(sqs.id);
    expect(sqs.connections).not.toContain(alb.id);
    expect(STATE.connections).toHaveLength(1);
  });

  it("alb->sqs is rejected when sqs->alb already exists (other direction)", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    createConnection(sqs.id, alb.id);
    createConnection(alb.id, sqs.id);
    expect(sqs.connections).toContain(alb.id);
    expect(alb.connections).not.toContain(sqs.id);
  });
});

describe("connect tool rejection feedback", () => {
  it("clears the selected endpoint and announces the rejection reason", () => {
    const alb = place("alb");
    const container = document.getElementById("canvas-container");
    const clickAlb = () => {
      raycastHits.services = [{ object: alb.mesh }];
      container.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      }));
    };

    STATE.activeTool = "connect";
    clickAlb();
    expect(STATE.selectedNodeId).toBe(alb.id);

    clickAlb();

    expect(STATE.selectedNodeId).toBeNull();
    expect(document.getElementById("live-status").textContent)
      .toBe(i18n.t("connection_same_node"));
    expect(STATE.connections).toHaveLength(0);
  });
});

describe("createService economics", () => {
  it("deducts the service cost and tracks it in finances", () => {
    STATE.money = 100;
    const waf = place("waf"); // cost 40
    expect(waf.type).toBe("waf");
    expect(STATE.money).toBe(60);
    expect(STATE.finances.expenses.services).toBe(40);
    expect(STATE.finances.expenses.byService.waf).toBe(40);
    expect(STATE.finances.expenses.countByService.waf).toBe(1);
  });

  it("refuses placement when money is insufficient", () => {
    STATE.money = CONFIG.services.db.cost - 1;
    createService("db", new globalThis.THREE.Vector3(0, 0, 40));
    expect(STATE.services).toHaveLength(0);
    expect(STATE.money).toBe(CONFIG.services.db.cost - 1);
  });

  it("refuses placement on an occupied tile", () => {
    const pos = new globalThis.THREE.Vector3(0, 0, 48);
    createService("waf", pos);
    createService("alb", pos.clone());
    expect(STATE.services).toHaveLength(1);
    expect(STATE.services[0].type).toBe("waf");
  });
});

describe("deleteConnection / deleteObject", () => {
  it("deleteConnection removes the edge and returns true", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    connect(alb, sqs);
    expect(deleteConnection(alb.id, sqs.id)).toBe(true);
    expect(alb.connections).not.toContain(sqs.id);
    expect(STATE.connections).toHaveLength(0);
  });

  it("deleteConnection returns false for a non-existent edge", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    expect(deleteConnection(alb.id, sqs.id)).toBe(false);
  });

  it("deleteObject refunds half the cost and removes edges from both sides", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    const moneyBefore = STATE.money;

    deleteObject(alb.id);

    expect(STATE.money).toBe(moneyBefore + Math.floor(CONFIG.services.alb.cost / 2));
    expect(STATE.services.map((s) => s.id)).toEqual([compute.id]);
    expect(STATE.internetNode.connections).not.toContain(alb.id);
    expect(STATE.connections).toHaveLength(0);
  });

  it("deleteObject removes queued, processing, and in-flight requests without a reputation penalty", () => {
    const compute = place("compute");
    const queued = new Request("READ");
    const processing = new Request("READ");
    const inFlight = new Request("READ");
    STATE.requests.push(queued, processing, inFlight);
    compute.queue.push(queued);
    compute.processing.push({ req: processing, timer: 0 });
    inFlight.flyTo(compute);
    const repBefore = STATE.reputation;

    deleteObject(compute.id);

    expect(STATE.requests).toHaveLength(0);
    expect(STATE.reputation).toBe(repBefore);
    expect(STATE.failures.READ).toBe(0);
  });
});

describe("snapToGrid", () => {
  it("snaps x/z to the tile grid and forces y to 0", () => {
    const snapped = snapToGrid(new globalThis.THREE.Vector3(5, 3, 7));
    expect(snapped.x).toBe(4); // tileSize 4
    expect(snapped.y).toBe(0);
    expect(snapped.z).toBe(8);
  });

  it("negative coordinates round to the nearest tile", () => {
    const snapped = snapToGrid(new globalThis.THREE.Vector3(-5, 0, -3));
    expect(snapped.x).toBe(-4);
    expect(snapped.z).toBe(-4);
  });
});
