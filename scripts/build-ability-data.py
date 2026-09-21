#!/usr/bin/env python3
"""
Builds data/abilityinfo.json directly from RotationMaster's icon library.

Why RotationMaster: the previous data/abilityinfo.json was ported from
LeMageTank's tracker, which predates RuneScape's March 2026 "Combat Style
Modernisation" rework (new abilities like Rend/Adaptive Strike/Bloodlust
mechanics, many old ones removed - Slice, Cleave, Sever, and others no
longer exist). RotationMaster's data is actively maintained and already
reflects the current roster, and since name and icon come from the same
source, there's no separate matching step.

This covers both combat abilities AND bindable items - weapons (including
dyed variants where RotationMaster has them), armour, and Invention perks -
since the app treats all of these the same way: a name, a tag, an icon,
bindable to a key. There is no cooldown/GCD data here (RotationMaster
doesn't track that) - by design, the app shows every keybind-triggered
item the instant it's pressed rather than simulating RuneScape's cooldowns.

Coverage note on dyed weapons: RotationMaster's data is inconsistent here.
Some dyed variants (e.g. certain Khopesh colours) only exist under garbled
auto-generated names (e.g. "shadowkhopeshoh") rather than a clean display
name - those are filtered out below rather than shown as garbage text, so
most weapon families currently only have their undyed icon, or no dyed
variant to bind at all. That's a real gap, not a bug - filling it in needs
either a better data source or hand-curated aliases in
scripts/dye-name-aliases.json (see below) as it's noticed by use.

Usage: python3 scripts/build-ability-data.py <path-to-RotationMaster-abilities.json>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# RotationMaster's own category names -> a short tag used for search/filtering
# in the setup UI and for the small colored badge shown next to each item.
CATEGORY_TAGS = {
    "Melee abilities": "melee",
    "Ranged Abilities": "ranged",
    "Magic Abilities": "magic",
    "Necromancy abilities": "necromancy",
    "Defence and Constitution Abilities": "defence",
    "Unlockable Abilities": "unlockable",
    "Melee Gear": "melee-gear",
    "Ranged Gear": "ranged-gear",
    "Magic Gear": "magic-gear",
    "Necromancy Gear": "necromancy-gear",
    "Invention Perks": "perk",
    "Jewellery": "jewellery",
    "Auras and Pocket slot": "pocket",
}

# A handful of entries RotationMaster only has under a garbled auto-generated
# name (see coverage note above). Mapping garbled-name -> clean display name
# recovers those instead of dropping them. Extend this file as more are
# found - it's a normal JSON object, e.g. {"shadowkhopeshoh": "Khopesh of
# Elidinis (shadow)"}.
ALIASES_PATH = Path(__file__).parent / "dye-name-aliases.json"

# RotationMaster occasionally lands a real, current combat ability under
# "Uncategorised"/"uncategorized" instead of one of the tagged categories
# above - e.g. Berserk, Decimate, and Vanquish (magic) all showed up there
# rather than under "Melee abilities" etc. This maps such an ability's exact
# display name (its "Emoji" field upstream) to the tag it should actually
# have, so it isn't silently dropped just because RotationMaster's own
# categorization missed it. Extend this file as more are noticed - a normal
# JSON object, e.g. {"Some New Ultimate": "necromancy"}.
CATEGORY_OVERRIDES_PATH = Path(__file__).parent / "ability-category-overrides.json"

# Garbled auto-generated names look like a single lowercase/numeral run with
# no spaces or punctuation (e.g. "shadowkhopeshoh", "3akhopeshmh"). This
# ONLY applies to gear categories - the ability categories legitimately use
# short all-lowercase names for some current abilities (e.g. "rend",
# "bloodlust", "chain", "sonic" are real, correct post-rework ability names
# in RotationMaster's data, not garbled codes), so filtering those out
# would silently drop real abilities.
GARBLED_NAME = re.compile(r"^[a-z0-9]+$")
GEAR_TAGS = {"melee-gear", "ranged-gear", "magic-gear", "necromancy-gear"}


def is_garbled(name: str) -> bool:
    return bool(GARBLED_NAME.match(name))


def main():
    if len(sys.argv) != 2:
        print("Usage: build-ability-data.py <path-to-RotationMaster-abilities.json>")
        sys.exit(1)

    rm_entries = json.loads(Path(sys.argv[1]).read_text())

    aliases = {}
    if ALIASES_PATH.exists():
        aliases = json.loads(ALIASES_PATH.read_text())

    category_overrides = {}
    if CATEGORY_OVERRIDES_PATH.exists():
        category_overrides = json.loads(CATEGORY_OVERRIDES_PATH.read_text())

    items = {}
    skipped_garbled = []
    recovered_overrides = []
    for entry in rm_entries:
        category = entry.get("Category")
        raw_name = entry.get("Emoji")
        tag = CATEGORY_TAGS.get(category)
        if tag is None and raw_name in category_overrides:
            tag = category_overrides[raw_name]
            recovered_overrides.append(raw_name)
        if tag is None:
            continue
        if not raw_name:
            continue

        if tag in GEAR_TAGS and is_garbled(raw_name):
            if raw_name in aliases:
                name = aliases[raw_name]
            else:
                skipped_garbled.append(raw_name)
                continue
        else:
            name = raw_name

        # First entry for a given name wins (RotationMaster has a small
        # number of exact-duplicate display names across categories).
        items.setdefault(name, {
            "action": name,
            "tag": tag,
            "icon": Path(entry["Src"]).name,
        })

    item_list = sorted(items.values(), key=lambda a: a["action"])

    out_path = ROOT / "data" / "abilityinfo.json"
    out_path.write_text(json.dumps(item_list, indent=2))

    print(f"Wrote {len(item_list)} items to {out_path}")
    by_tag = {}
    for a in item_list:
        by_tag[a["tag"]] = by_tag.get(a["tag"], 0) + 1
    for tag, count in sorted(by_tag.items()):
        print(f"  {tag}: {count}")

    if recovered_overrides:
        print(f"\n{len(recovered_overrides)} entries recovered via "
              f"{CATEGORY_OVERRIDES_PATH.name} (RotationMaster had them "
              f"uncategorised): {', '.join(recovered_overrides)}")

    if skipped_garbled:
        print(f"\n{len(skipped_garbled)} entries skipped (garbled auto-generated name, "
              f"no clean name available - add to {ALIASES_PATH.name} to recover):")
        for name in skipped_garbled[:30]:
            print(f"  - {name}")
        if len(skipped_garbled) > 30:
            print(f"  ... and {len(skipped_garbled) - 30} more")


if __name__ == "__main__":
    main()
