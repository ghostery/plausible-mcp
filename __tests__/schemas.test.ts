import { describe, it, expect } from "vitest";
import {
  buildDimensionFilters,
  buildPropertyFilters,
  isCustomPropertyDimension,
  dimensionSchema,
  dimensionFilterSchema,
  propertyFilterSchema,
} from "../src/schemas.js";

describe("isCustomPropertyDimension", () => {
  it("accepts event:props:<name>", () => {
    expect(isCustomPropertyDimension("event:props:plan")).toBe(true);
  });

  it("rejects standard dimensions", () => {
    expect(isCustomPropertyDimension("event:page")).toBe(false);
    expect(isCustomPropertyDimension("visit:source")).toBe(false);
  });

  it("rejects the bare prefix with no name", () => {
    expect(isCustomPropertyDimension("event:props:")).toBe(false);
  });
});

describe("dimensionSchema", () => {
  it("parses a standard dimension", () => {
    expect(dimensionSchema.safeParse("event:page").success).toBe(true);
    expect(dimensionSchema.safeParse("visit:country_name").success).toBe(true);
  });

  it("parses a custom property dimension", () => {
    expect(dimensionSchema.safeParse("event:props:destination_host").success).toBe(true);
  });

  it("rejects an unknown dimension", () => {
    expect(dimensionSchema.safeParse("event:nonsense").success).toBe(false);
  });

  it("rejects the bare custom-property prefix", () => {
    expect(dimensionSchema.safeParse("event:props:").success).toBe(false);
  });
});

describe("propertyFilterSchema", () => {
  it("defaults the operator to is", () => {
    const parsed = propertyFilterSchema.parse({ property: "plan", values: ["pro"] });
    expect(parsed.operator).toBe("is");
  });

  it("rejects an empty values array", () => {
    expect(
      propertyFilterSchema.safeParse({ property: "plan", values: [] }).success
    ).toBe(false);
  });

  it("rejects an unknown operator", () => {
    expect(
      propertyFilterSchema.safeParse({
        property: "plan",
        operator: "matches",
        values: ["pro"],
      }).success
    ).toBe(false);
  });
});

describe("dimensionFilterSchema", () => {
  it("defaults the operator to is", () => {
    const parsed = dimensionFilterSchema.parse({
      dimension: "visit:utm_campaign",
      values: ["spring-launch"],
    });
    expect(parsed.operator).toBe("is");
  });

  it("rejects a custom property dimension", () => {
    expect(
      dimensionFilterSchema.safeParse({
        dimension: "event:props:plan",
        values: ["pro"],
      }).success
    ).toBe(false);
  });

  it("rejects an empty values array", () => {
    expect(
      dimensionFilterSchema.safeParse({
        dimension: "visit:country",
        values: [],
      }).success
    ).toBe(false);
  });

  it("rejects an unknown operator", () => {
    expect(
      dimensionFilterSchema.safeParse({
        dimension: "visit:country",
        operator: "matches",
        values: ["US"],
      }).success
    ).toBe(false);
  });
});

describe("buildDimensionFilters", () => {
  it("defaults the operator to is", () => {
    expect(
      buildDimensionFilters([{ dimension: "visit:country", values: ["US"] }])
    ).toEqual([["is", "visit:country", ["US"]]]);
  });

  it("passes through explicit operators and multiple values", () => {
    expect(
      buildDimensionFilters([
        {
          dimension: "visit:utm_campaign",
          operator: "contains",
          values: ["spring", "summer"],
        },
      ])
    ).toEqual([["contains", "visit:utm_campaign", ["spring", "summer"]]]);
  });

  it("builds one filter per entry", () => {
    expect(
      buildDimensionFilters([
        { dimension: "visit:source", operator: "is", values: ["Google"] },
        { dimension: "visit:device", operator: "is_not", values: ["Mobile"] },
      ])
    ).toEqual([
      ["is", "visit:source", ["Google"]],
      ["is_not", "visit:device", ["Mobile"]],
    ]);
  });
});

describe("buildPropertyFilters", () => {
  it("prefixes the property name and defaults the operator to is", () => {
    expect(buildPropertyFilters([{ property: "plan", values: ["pro"] }])).toEqual([
      ["is", "event:props:plan", ["pro"]],
    ]);
  });

  it("passes through explicit operators and multiple values", () => {
    expect(
      buildPropertyFilters([
        { property: "destination_host", operator: "contains", values: ["github", "gitlab"] },
      ])
    ).toEqual([["contains", "event:props:destination_host", ["github", "gitlab"]]]);
  });

  it("builds one filter per entry", () => {
    expect(
      buildPropertyFilters([
        { property: "plan", operator: "is", values: ["pro"] },
        { property: "ctry", operator: "is_not", values: ["US"] },
      ])
    ).toEqual([
      ["is", "event:props:plan", ["pro"]],
      ["is_not", "event:props:ctry", ["US"]],
    ]);
  });
});
