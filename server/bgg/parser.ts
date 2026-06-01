// XML parsers for BGG xmlapi2 responses.

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["item", "link", "name"].includes(name),
});

export interface BggCollectionEntry {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

export interface BggThingItem {
  bggId: number;
  name: string;
  dimensionsMm: { w: number; h: number; d: number } | null;
  /** BGG ids of base game this item expands. */
  expansionOfBggIds: number[];
}

export interface BggSearchEntry {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

export function parseCollection(xml: string): BggCollectionEntry[] {
  const doc = parser.parse(xml);
  if (!doc?.items?.item) return [];
  const items = Array.isArray(doc.items.item) ? doc.items.item : [doc.items.item];
  return items
    .filter((it: any) => it?.["@_objectid"])
    .map((it: any) => ({
      bggId: Number(it["@_objectid"]),
      name: typeof it.name === "string" ? it.name : it.name?.["#text"] ?? "",
      yearPublished: it.yearpublished ? Number(it.yearpublished) : null,
    }));
}

export function parseThing(xml: string): BggThingItem[] {
  const doc = parser.parse(xml);
  if (!doc?.items?.item) return [];
  const items = Array.isArray(doc.items.item) ? doc.items.item : [doc.items.item];

  return items.map((it: any): BggThingItem => {
    const bggId = Number(it["@_id"]);
    const nameField = Array.isArray(it.name) ? it.name : [it.name].filter(Boolean);
    const primary = nameField.find((n: any) => n?.["@_type"] === "primary") ?? nameField[0];
    const name = primary?.["@_value"] ?? "";

    const wIn = it.width?.["@_value"] ? Number(it.width["@_value"]) : 0;
    const hIn = it.height?.["@_value"] ? Number(it.height["@_value"]) : 0;
    const dIn = it.depth?.["@_value"] ? Number(it.depth["@_value"]) : 0;
    const dims =
      wIn > 0 && hIn > 0 && dIn > 0
        ? {
            w: Math.round(wIn * 25.4),
            h: Math.round(hIn * 25.4),
            d: Math.round(dIn * 25.4),
          }
        : null;

    const links = Array.isArray(it.link) ? it.link : [it.link].filter(Boolean);
    const expansionOf = links
      .filter((l: any) => l?.["@_type"] === "boardgameexpansion" && l?.["@_inbound"] === "true")
      .map((l: any) => Number(l["@_id"]));

    return {
      bggId,
      name,
      dimensionsMm: dims,
      expansionOfBggIds: expansionOf,
    };
  });
}

export function parseSearch(xml: string): BggSearchEntry[] {
  const doc = parser.parse(xml);
  if (!doc?.items?.item) return [];
  const items = Array.isArray(doc.items.item) ? doc.items.item : [doc.items.item];
  return items.map((it: any) => ({
    bggId: Number(it["@_id"]),
    name: it.name?.["@_value"] ?? "",
    yearPublished: it.yearpublished?.["@_value"] ? Number(it.yearpublished["@_value"]) : null,
  }));
}
