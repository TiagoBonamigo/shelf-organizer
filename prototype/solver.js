// Solver — mock packer that builds plausible layouts.
// Not a real optimizer; produces packed-looking results that satisfy basic constraints.

(function () {
  const SETTINGS_DEFAULTS = {
    defaultPaddingReserveMm: 20,
    defaultMaxStackCount: 4,
    defaultMaxStackHeightMm: null,
    defaultProximityWeight: 0.3,
  };

  // Resolve box footprint per orientation.
  // For standing: width-along-shelf = smallest dimension (the depth/thickness),
  //   height-above-floor = largest dimension.
  // For stacked: width-along-shelf = largest dimension, height-above-floor = smallest.
  function resolveDims(box, orientation) {
    const dims = box.dimensions;
    if (!dims || dims.w === 0) return null;
    const arr = [dims.w, dims.h, dims.d].sort((a, b) => b - a); // [big, mid, small]
    if (orientation === "standing") {
      // spine-out: smallest along shelf, largest is height
      return {
        widthOnShelf: arr[2],
        heightOnShelf: arr[0],
        depthOnShelf: arr[1],
        faceArea: arr[0] * arr[1],
      };
    } else {
      // stacked: largest face down
      return {
        widthOnShelf: arr[0],
        heightOnShelf: arr[2],
        depthOnShelf: arr[1],
        faceArea: arr[0] * arr[1],
      };
    }
  }

  function shelvesByCabinetOrder(cabinets, shelves) {
    const out = [];
    const sortedCabs = [...cabinets].sort((a, b) => a.position - b.position);
    for (const cab of sortedCabs) {
      const cabShelves = shelves
        .filter((s) => s.cabinetId === cab.id)
        .sort((a, b) => a.position - b.position);
      for (const sh of cabShelves) out.push(sh);
    }
    return out;
  }

  // Pack one shelf with a list of boxes. Returns { placements, unplaced, gap }.
  function packShelf(shelf, candidates, allBoxes) {
    const placements = [];
    const unplaced = [];
    const padding = shelf.paddingReserveMm ?? 20;
    const availW = shelf.widthMm - padding;
    let cursor = 0;

    if (shelf.orientation === "vertical" || shelf.orientation === "mixed") {
      // Standing region
      // Stand boxes that fit in height.
      for (const box of candidates) {
        const r = resolveDims(box, "standing");
        if (!r) continue;
        if (r.heightOnShelf > shelf.heightMm) {
          unplaced.push({ box, reason: "Too tall for any shelf" });
          continue;
        }
        if (r.depthOnShelf > shelf.depthMm) {
          unplaced.push({ box, reason: "Too deep for this shelf" });
          continue;
        }
        if (cursor + r.widthOnShelf > (shelf.orientation === "mixed" ? availW * 0.6 : availW)) {
          unplaced.push({ box, reason: "no space on assigned shelf" });
          continue;
        }
        placements.push({
          boxId: box.id,
          shelfId: shelf.id,
          positionMm: cursor,
          widthMm: r.widthOnShelf,
          heightMm: r.heightOnShelf,
          orientation: "standing",
          forwardFace: "wh",
          stackParentBoxId: null,
          pinned: false,
        });
        cursor += r.widthOnShelf;
      }
      // For mixed shelves, also pack a stacking zone from the right.
      if (shelf.orientation === "mixed") {
        const stackZoneStart = Math.max(cursor + 24, availW * 0.6 + 8);
        const stackZoneEnd = availW;
        cursor = stackZoneStart;
        // Build stacks from remaining unplaced candidates (only those marked "no space")
        const stackCands = unplaced
          .filter((u) => u.reason === "no space on assigned shelf")
          .map((u) => u.box);
        unplaced.length = 0;
        let stacked = packStacks(shelf, stackCands, cursor, stackZoneEnd);
        for (const p of stacked.placements) placements.push(p);
        for (const u of stacked.unplaced) unplaced.push(u);
      }
    } else if (shelf.orientation === "horizontal") {
      // Stacking
      const stacked = packStacks(shelf, candidates, 0, availW);
      for (const p of stacked.placements) placements.push(p);
      for (const u of stacked.unplaced) unplaced.push(u);
    }

    // Compute gap on shelf (residual width after packing standing zone)
    let usedEnd = 0;
    for (const p of placements) usedEnd = Math.max(usedEnd, p.positionMm + p.widthMm);
    const gap = shelf.widthMm - usedEnd;
    return { placements, unplaced, gap };
  }

  // Build stacks within a horizontal region [startMm, endMm].
  // Stacks of pyramid order: largest face area at bottom, decreasing upward.
  function packStacks(shelf, boxes, startMm, endMm) {
    const placements = [];
    const unplaced = [];
    const maxStackCount = shelf.maxStackCount ?? 4;
    const maxStackHeight = shelf.maxStackHeightMm ?? shelf.heightMm;
    // sort descending by face area (large bottoms)
    const sorted = [...boxes]
      .map((b) => ({ box: b, r: resolveDims(b, "stacked") }))
      .filter((x) => x.r && x.r.heightOnShelf <= shelf.heightMm)
      .sort((a, b) => b.r.faceArea - a.r.faceArea);

    const stacks = []; // each: { baseX, baseW, items: [{box, r, y, parentId}] }

    for (const { box, r } of sorted) {
      // try to put on top of an existing stack
      let placed = false;
      for (const stk of stacks) {
        const top = stk.items[stk.items.length - 1];
        if (top.r.faceArea <= r.faceArea) continue; // pyramid violation
        if (stk.items.length >= maxStackCount) continue;
        const stackH = stk.items.reduce((acc, it) => acc + it.r.heightOnShelf, 0);
        if (stackH + r.heightOnShelf > maxStackHeight) continue;
        if (r.widthOnShelf > stk.baseW) continue;
        // OK to place
        const y = stackH;
        stk.items.push({ box, r, y, parentId: top.box.id });
        placed = true;
        break;
      }
      if (placed) continue;

      // start a new stack — find horizontal space
      const lastEnd = stacks.length
        ? stacks[stacks.length - 1].baseX + stacks[stacks.length - 1].baseW
        : startMm;
      const baseX = stacks.length ? lastEnd + 12 : startMm;
      if (baseX + r.widthOnShelf > endMm) {
        unplaced.push({ box, reason: "no shelf has enough width" });
        continue;
      }
      stacks.push({
        baseX,
        baseW: r.widthOnShelf,
        items: [{ box, r, y: 0, parentId: null }],
      });
    }

    for (const stk of stacks) {
      for (const it of stk.items) {
        placements.push({
          boxId: it.box.id,
          shelfId: shelf.id,
          positionMm: stk.baseX,
          widthMm: it.r.widthOnShelf,
          heightMm: it.r.heightOnShelf,
          stackYMm: it.y,
          orientation: "stacked",
          forwardFace: "wh",
          stackParentBoxId: it.parentId,
          pinned: false,
        });
      }
    }
    return { placements, unplaced };
  }

  // Global assignment: assign each box to a shelf based on fit.
  function assignBoxes(boxes, shelves) {
    // Only boxes with real dimensions are placeable.
    const placeable = boxes.filter(
      (b) => b.dimensions && b.dimensions.w > 0 && b.dimensions.h > 0
    );
    // sort by max-dim descending so big boxes find their home first
    placeable.sort((a, b) => {
      const ma = Math.max(a.dimensions.w, a.dimensions.h, a.dimensions.d);
      const mb = Math.max(b.dimensions.w, b.dimensions.h, b.dimensions.d);
      return mb - ma;
    });

    // Group expansions with their parents
    placeable.sort((a, b) => {
      const pa = a.expansionOfBoxId || a.id;
      const pb = b.expansionOfBoxId || b.id;
      if (pa === pb) return 0;
      return 0;
    });
    // Build clusters: parent followed by its expansions (keeps proximity)
    const clusters = [];
    const placedIds = new Set();
    for (const b of placeable) {
      if (placedIds.has(b.id)) continue;
      if (b.expansionOfBoxId) {
        const parent = placeable.find((p) => p.id === b.expansionOfBoxId);
        if (parent && !placedIds.has(parent.id)) {
          const cluster = [parent];
          placedIds.add(parent.id);
          for (const e of placeable) {
            if (e.expansionOfBoxId === parent.id) {
              cluster.push(e);
              placedIds.add(e.id);
            }
          }
          clusters.push(cluster);
        }
      } else {
        const cluster = [b];
        placedIds.add(b.id);
        for (const e of placeable) {
          if (e.expansionOfBoxId === b.id) {
            cluster.push(e);
            placedIds.add(e.id);
          }
        }
        clusters.push(cluster);
      }
    }
    // sort clusters by size of base box
    clusters.sort((a, b) => {
      const ma = Math.max(a[0].dimensions.w, a[0].dimensions.h);
      const mb = Math.max(b[0].dimensions.w, b[0].dimensions.h);
      return mb - ma;
    });

    // Pre-init shelf state
    const shelfState = {};
    for (const sh of shelves) {
      shelfState[sh.id] = { shelf: sh, used: 0, count: 0 };
    }

    const assignment = {};
    for (const sh of shelves) assignment[sh.id] = [];
    const unplacedReasons = [];

    function tryShelvesForBox(box) {
      // pick shelves whose remaining width fits the box and orientation matches
      const dims = box.dimensions;
      if (!dims || dims.w === 0) return null;
      const sorted = [dims.w, dims.h, dims.d].sort((a, b) => b - a);
      const standingW = sorted[2];
      const standingH = sorted[0];
      const standingD = sorted[1];
      const stackedW = sorted[0];
      const stackedH = sorted[2];
      const stackedD = sorted[1];

      // try shelves in order; prefer to fill same shelves as siblings
      const candidates = shelves.slice();

      for (const sh of candidates) {
        const st = shelfState[sh.id];
        const padding = sh.paddingReserveMm ?? 20;
        const avail = sh.widthMm - padding - st.used;
        if (sh.orientation === "vertical" || sh.orientation === "mixed") {
          if (standingH <= sh.heightMm && standingD <= sh.depthMm && standingW <= avail) {
            return { shelf: sh, mode: "standing" };
          }
        }
        if (sh.orientation === "horizontal" || sh.orientation === "mixed") {
          if (stackedW <= avail && stackedH <= sh.heightMm && stackedD <= sh.depthMm) {
            return { shelf: sh, mode: "stacked" };
          }
        }
      }
      return null;
    }

    for (const cluster of clusters) {
      // try to place the cluster on the same shelf if possible; else split
      let lastShelf = null;
      for (const box of cluster) {
        const r = tryShelvesForBox(box);
        if (!r) {
          unplacedReasons.push({
            box,
            reason: box.dimensions.w === 0 ? "missing dimensions" : "no shelf has enough width",
          });
          continue;
        }
        // try to keep cluster together
        let target = r.shelf;
        if (lastShelf) {
          const sib = shelves.find((s) => s.id === lastShelf);
          if (sib) {
            const padding = sib.paddingReserveMm ?? 20;
            const used = shelfState[sib.id].used;
            const sorted = [box.dimensions.w, box.dimensions.h, box.dimensions.d].sort(
              (a, b) => b - a
            );
            const w = sib.orientation === "horizontal" ? sorted[0] : sorted[2];
            if (sib.widthMm - padding - used >= w) {
              target = sib;
            }
          }
        }
        const sorted = [box.dimensions.w, box.dimensions.h, box.dimensions.d].sort(
          (a, b) => b - a
        );
        const widthUsed =
          target.orientation === "horizontal" ? sorted[0] : sorted[2];
        assignment[target.id].push(box);
        shelfState[target.id].used += widthUsed;
        shelfState[target.id].count += 1;
        lastShelf = target.id;
      }
    }

    return { assignment, unplaced: unplacedReasons };
  }

  function solve(state) {
    const { cabinets, shelves, boxes } = state;
    const orderedShelves = shelvesByCabinetOrder(cabinets, shelves);

    const { assignment, unplaced } = assignBoxes(boxes, orderedShelves);

    const placements = [];
    const allUnplaced = [];
    let largestGapMm = 0;
    let largestGapShelfId = null;

    for (const sh of orderedShelves) {
      const candidates = assignment[sh.id] || [];
      const { placements: pl, unplaced: un, gap } = packShelf(sh, candidates, boxes);
      for (const p of pl) placements.push(p);
      for (const u of un) allUnplaced.push(u);
      if (gap > largestGapMm) {
        largestGapMm = gap;
        largestGapShelfId = sh.id;
      }
    }
    for (const u of unplaced) allUnplaced.push(u);

    // Proximity score
    let proximityScore = 0;
    const placementByBoxId = {};
    for (const p of placements) placementByBoxId[p.boxId] = p;
    for (const box of boxes) {
      if (!box.expansionOfBoxId) continue;
      const p1 = placementByBoxId[box.id];
      const p2 = placementByBoxId[box.expansionOfBoxId];
      if (!p1 || !p2) {
        proximityScore += 5;
        continue;
      }
      if (p1.shelfId === p2.shelfId) {
        proximityScore += 0;
      } else {
        const s1 = shelves.find((s) => s.id === p1.shelfId);
        const s2 = shelves.find((s) => s.id === p2.shelfId);
        if (s1 && s2 && s1.cabinetId === s2.cabinetId) proximityScore += 2;
        else proximityScore += 3;
      }
    }

    return {
      id: "layout-" + Math.random().toString(36).slice(2, 8),
      name: "Current arrangement",
      createdAt: new Date().toISOString(),
      placements,
      unplaced: allUnplaced.map((u) => ({ boxId: u.box.id, reason: u.reason })),
      metrics: {
        largestGapMm,
        largestGapShelfId,
        proximityScore,
        placedCount: placements.length,
        unplacedCount: allUnplaced.length,
      },
    };
  }

  window.SOLVER = { solve, resolveDims };
})();
