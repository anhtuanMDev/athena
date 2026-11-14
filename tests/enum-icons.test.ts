import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyOptionIcons } from "../app/lib/enum-icons";

// An enum's editors pick option icons next to the form. They were kept by the
// option's position, so adding an option at the top (the editors' "Add
// Option") or removing one above moved every picked icon onto the option
// that took that position. They're kept by the form's own key for the option
// now (useFieldArray's field id), which follows the option wherever it moves.

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1").toString("base64");
const DIR = "public/assets/overwatch/enums/sub-role";

describe("an enum's option icons when saved", () => {
  it("stay with the option they were picked for when an option is added above it", () => {
    // Picked for "medic" while it was first; then "Add Option" put a new one on top.
    const picks = { "key-medic": { name: "medic.png", base64: PNG } };
    const options = [{ id: "tank" }, { id: "medic" }, { id: "recon" }];
    const uploads = applyOptionIcons(options, ["key-new", "key-medic", "key-recon"], picks, "overwatch", "sub-role");
    assert.deepEqual(uploads, [{ path: `${DIR}/medic.png`, base64: PNG }]);
    assert.deepEqual(options, [{ id: "tank" }, { id: "medic", icon: "/api/assets/overwatch/enums/sub-role/medic.png" }, { id: "recon" }]);
  });

  it("stay with their option when one above it is removed, and a removed option's pick is left out", () => {
    const picks = { "key-tank": { name: "a.png", base64: PNG }, "key-recon": { name: "b.webp", base64: WEBP } };
    // "tank" was removed after its icon was picked; "recon" moved up.
    const options = [{ id: "medic", icon: "/api/assets/overwatch/enums/sub-role/medic.png" }, { id: "recon" }];
    const uploads = applyOptionIcons(options, ["key-medic", "key-recon"], picks, "overwatch", "sub-role");
    assert.deepEqual(uploads, [{ path: `${DIR}/recon.webp`, base64: WEBP }]);
    assert.equal(options[0].icon, "/api/assets/overwatch/enums/sub-role/medic.png");
    assert.equal(options[1].icon, "/api/assets/overwatch/enums/sub-role/recon.webp");
  });

  it("are named after the option's value and the picture's type, in the enum's own folder", () => {
    const options = [{ id: "hit-scan" }];
    const uploads = applyOptionIcons(options, ["k"], { k: { name: "Hitscan Icon.PNG", base64: WEBP } }, "overwatch", "damage-types");
    assert.deepEqual(uploads, [{ path: "public/assets/overwatch/enums/damage-types/hit-scan.webp", base64: WEBP }]);
    // A name without an extension and a type it can't tell (the field refuses those): png.
    assert.equal(applyOptionIcons([{ id: "x" }], ["k"], { k: { name: "icon", base64: "AA" } }, "g", "e")[0].path, "public/assets/g/enums/e/x.png");
  });
});
