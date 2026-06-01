import { describe, expect, it } from "vitest";
import { parseCollection, parseSearch, parseThing } from "./parser.js";

describe("parseCollection", () => {
  it("returns an empty array for an empty document", () => {
    expect(parseCollection("<items></items>")).toEqual([]);
  });

  it("extracts bggId and yearPublished for each item", () => {
    const xml = `
      <items>
        <item objectid="1"><name sortindex="1">One</name><yearpublished>2010</yearpublished></item>
        <item objectid="2"><name sortindex="1">Two</name></item>
      </items>`;
    const result = parseCollection(xml);
    expect(result.map((r) => r.bggId)).toEqual([1, 2]);
    expect(result[0].yearPublished).toBe(2010);
    expect(result[1].yearPublished).toBeNull();
  });

  it("skips items missing the objectid attribute", () => {
    const xml = `
      <items>
        <item><name sortindex="1">Stray</name></item>
        <item objectid="42"><name sortindex="1">Good</name></item>
      </items>`;
    const result = parseCollection(xml);
    expect(result).toHaveLength(1);
    expect(result[0].bggId).toBe(42);
  });
});

describe("parseThing", () => {
  it("picks the primary name and converts inch dimensions to millimetres", () => {
    const xml = `
      <items>
        <item id="174430">
          <name type="primary" value="Gloomhaven"/>
          <name type="alternate" value="Alt"/>
          <width value="11.8"/>
          <height value="5.9"/>
          <depth value="17.7"/>
        </item>
      </items>`;
    const [item] = parseThing(xml);
    expect(item.bggId).toBe(174430);
    expect(item.name).toBe("Gloomhaven");
    expect(item.dimensionsMm).toEqual({
      w: Math.round(11.8 * 25.4),
      h: Math.round(5.9 * 25.4),
      d: Math.round(17.7 * 25.4),
    });
  });

  it("falls back to the first name when there is no primary", () => {
    const xml = `
      <items>
        <item id="1">
          <name type="alternate" value="Only Alt"/>
        </item>
      </items>`;
    expect(parseThing(xml)[0].name).toBe("Only Alt");
  });

  it("returns null dimensions when any axis is missing or zero", () => {
    const xml = `
      <items>
        <item id="1">
          <name type="primary" value="No Dim"/>
          <width value="10"/>
          <height value="0"/>
        </item>
      </items>`;
    expect(parseThing(xml)[0].dimensionsMm).toBeNull();
  });

  it("extracts inbound expansion links and ignores other link types", () => {
    const xml = `
      <items>
        <item id="50">
          <name type="primary" value="Expansion"/>
          <link type="boardgameexpansion" id="10" inbound="true"/>
          <link type="boardgameexpansion" id="11" inbound="true"/>
          <link type="boardgamecategory" id="99"/>
          <link type="boardgameexpansion" id="999"/>
        </item>
      </items>`;
    expect(parseThing(xml)[0].expansionOfBggIds).toEqual([10, 11]);
  });

  it("returns an empty array for a document with no items", () => {
    expect(parseThing("<items></items>")).toEqual([]);
  });
});

describe("parseSearch", () => {
  it("extracts bggId and yearPublished from search results", () => {
    const xml = `
      <items>
        <item id="1">
          <name value="Catan"/>
          <yearpublished value="1995"/>
        </item>
        <item id="2">
          <name value="Untitled"/>
        </item>
      </items>`;
    const result = parseSearch(xml);
    expect(result.map((r) => r.bggId)).toEqual([1, 2]);
    expect(result[0].yearPublished).toBe(1995);
    expect(result[1].yearPublished).toBeNull();
  });

  it("returns an empty array when there are no items", () => {
    expect(parseSearch("<items></items>")).toEqual([]);
  });
});
