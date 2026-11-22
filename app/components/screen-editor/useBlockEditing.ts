import { useEffect, useRef, useState } from "react";

import { blockSpec } from "~/lib/screen-model";
import { createBlock } from "~/lib/screen-starters";

import { focusAfterMove, focusAfterRemove, reportedJson, withProp, withoutBlockErrors } from "./utils/block-edits";

import type { BlockActions } from "./types";
import type { Dispatch, SetStateAction } from "react";
import type { PrimitiveManifest, ScreenBlock, ScreenFile } from "~/lib/screen-model";

interface BlockEditingSetup {
  screen: ScreenFile | null;
  setScreen: Dispatch<SetStateAction<ScreenFile | null>>;
  manifest: PrimitiveManifest | null;
  /** Shows the screen's settings (an issue of the screen itself) or the blocks pane (a block's). */
  show: { settings: () => void; blocks: () => void };
}

/** What the block operations change: the blocks, which one is open, the JSON boxes that don't parse, and where focus goes next. */
interface BlockEdits {
  blocks: ScreenBlock[];
  manifest: PrimitiveManifest | null;
  setBlocks: (edit: (current: ScreenBlock[]) => ScreenBlock[]) => void;
  setExpandedId: Dispatch<SetStateAction<string | null>>;
  setJsonErrors: Dispatch<SetStateAction<Record<string, string>>>;
  /** Focus goes to `elementId` after the next render, and `said` is said to screen readers. */
  focusNext: (elementId: string, said: string) => void;
}

/** A block's name in the manifest, else its type. */
const nameOf = (manifest: PrimitiveManifest | null, block: ScreenBlock) => blockSpec(manifest, block.type)?.name ?? block.type;

/** Focus for an element once the render that shows it is done: the function names the element's id. */
function usePendingFocus(): (elementId: string) => void {
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) {
      return;
    }
    const element = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    element?.focus();
  });
  return (elementId) => {
    pendingFocus.current = elementId;
  };
}

/** Moving a block, duplicating it and removing it, each saying what it did. */
function structureEdits({ blocks, manifest, setBlocks, setExpandedId, setJsonErrors, focusNext }: BlockEdits): Pick<BlockActions, "move" | "duplicate" | "remove"> {
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) {
      return;
    }
    const block = blocks[index];
    setBlocks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    focusNext(focusAfterMove({ blockId: block.id, target, delta, count: blocks.length }), `Moved ${nameOf(manifest, block)} to position ${String(target + 1)} of ${String(blocks.length)}.`);
  };
  const duplicate = (index: number) => {
    const original = blocks[index];
    const copy = { ...createBlock(original.type), props: structuredClone(original.props), visible: original.visible, tab: original.tab };
    setBlocks((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setExpandedId(copy.id);
    focusNext(`block-${copy.id}-toggle`, `Duplicated ${nameOf(manifest, original)} as block ${String(index + 2)}.`);
  };
  const remove = (index: number) => {
    const block = blocks[index];
    setBlocks((current) => current.filter((entry) => entry.id !== block.id));
    setJsonErrors((prev) => withoutBlockErrors(prev, block.id));
    focusNext(focusAfterRemove(blocks, index), `Removed ${nameOf(manifest, block)}.`);
  };
  return { move, duplicate, remove };
}

/** Editing a block's fields and props, and keeping track of its JSON boxes that don't parse. */
function propEdits({ setBlocks, setJsonErrors }: Pick<BlockEdits, "setBlocks" | "setJsonErrors">): Pick<BlockActions, "patch" | "updateProp" | "removeProps" | "reportJson"> {
  const edit = (blockId: string, change: (block: ScreenBlock) => ScreenBlock) => {
    setBlocks((current) => current.map((entry) => (entry.id === blockId ? change(entry) : entry)));
  };
  return {
    patch: (blockId, patch) => {
      edit(blockId, (block) => ({ ...block, ...patch }));
    },
    updateProp: (blockId, name, value) => {
      edit(blockId, (block) => withProp(block, name, value));
    },
    // Drops props the app won't take (styles, callbacks, props the block doesn't have).
    removeProps: (blockId, names) => {
      edit(blockId, (block) => ({ ...block, props: Object.fromEntries(Object.entries(block.props).filter(([name]) => !names.includes(name))) }));
    },
    reportJson: (key) => (error) => {
      setJsonErrors((prev) => reportedJson(prev, { key, error }));
    },
  };
}

/** Opens what an issue is about: the screen's settings (no block), or the block, scrolled into view. */
function revealer({ show, setExpandedId, focusLater }: { show: BlockEditingSetup["show"]; setExpandedId: BlockEdits["setExpandedId"]; focusLater: (elementId: string) => void }) {
  return (blockId: string) => {
    if (!blockId) {
      show.settings();
      return;
    }
    setExpandedId(blockId);
    show.blocks();
    focusLater(`block-${blockId}-toggle`);
    requestAnimationFrame(() => document.getElementById(`block-${blockId}`)?.scrollIntoView({ block: "nearest" }));
  };
}

/**
 * The screen editor's blocks: which one is open, the block picker, the JSON
 * boxes that don't parse, and the operations on blocks. Each operation moves
 * focus where the next keypress makes sense and says what it did to screen
 * readers (`announcement`).
 */
export function useBlockEditing({ screen, setScreen, manifest, show }: BlockEditingSetup) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const focusLater = usePendingFocus();
  const blocks = screen?.blocks ?? [];
  const edits: BlockEdits = {
    blocks,
    manifest,
    setBlocks: (edit) => {
      setScreen((prev) => (prev ? { ...prev, blocks: edit(prev.blocks) } : prev));
    },
    setExpandedId,
    setJsonErrors,
    focusNext: (elementId, said) => {
      focusLater(elementId);
      setAnnouncement(said);
    },
  };
  const addBlock = (type: string) => {
    const block = createBlock(type);
    edits.setBlocks((current) => [...current, block]);
    setExpandedId(block.id);
    setPickerOpen(false);
    edits.focusNext(`block-${block.id}-toggle`, `Added ${blockSpec(manifest, type)?.name ?? type} as block ${String(blocks.length + 1)}.`);
  };
  const toggle = (blockId: string) => {
    setExpandedId((current) => (current === blockId ? null : blockId));
  };
  const actions: BlockActions = { toggle, ...propEdits(edits), ...structureEdits(edits) };
  const blockName = (blockId: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    return block ? nameOf(manifest, block) : undefined;
  };
  const togglePicker = () => {
    setPickerOpen((open) => !open);
  };
  return { expandedId, isPickerOpen, togglePicker, jsonErrors, announcement, actions, addBlock, revealBlock: revealer({ show, setExpandedId, focusLater }), blockName };
}
