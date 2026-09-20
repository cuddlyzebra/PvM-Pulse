#!/usr/bin/env python3
"""
Builds data/icon-map.json, mapping each ability name in data/abilityinfo.json
to an icon filename in data/icons/.

Icons come from RotationMaster (https://github.com/cuddlyzebra/RotationMaster),
which ships a local, bundled icon library plus its own name lookup table
(src/assets/abilities.json) rather than relying on Discord/Imgur-hosted
images fetched at runtime. We match on the human-readable "Emoji" field in
that table against our ability names.

A plain normalized-string match only catches ~215/261 abilities.
RotationMaster's naming isn't perfectly consistent with ours, so this also
tries a few generalizable fallback strategies before giving up on a name:

  1. Exact match, case/punctuation-insensitive.
  2. Both sides with trailing parentheticals stripped - handles dose counts
     ("Overload (4)" vs "Overload") and enchant suffixes ("(e)").
  3. "<Element> Barrage" <-> "Barrage (<element>)" - RotationMaster lists
     ancient magicks spells in the reversed form.
  4. "<Name>" <-> "<Name> ability" - RotationMaster suffixes some entries
     this way to disambiguate the ability from a same-named item/perk.
  5. A small explicit alias table for one-off irregular cases (e.g.
     "Anticipation" is filed under the verb form "Anticipate") that don't
     fit a general rule. Extend ALIASES below as more are found.

Entries whose only match is a RotationMaster icon prefixed "OLD" (a
deprecated icon kept after Jagex reworked the ability's actual art) are
used only as a last-resort fallback, since a current icon is preferred
when one exists.

Re-run this whenever abilityinfo.json changes (e.g. new abilities added) or
the RotationMaster icon set is refreshed.

Usage: python3 scripts/build-icon-map.py <path-to-RotationMaster-abilities.json>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# One-off naming differences that don't fit a general rule. Left-hand side
# is the ability name as it appears in abilityinfo.json.
ALIASES = {
    "Anticipation": "Anticipate",
}


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def strip_parens(name: str) -> str:
    return re.sub(r"\([^)]*\)", "", name).strip()


def build_lookup(rm_entries):
    """Returns (current_lookup, old_lookup) - both normalized-key -> filename.
    old_lookup holds entries whose Emoji name was prefixed "OLD", used only
    as a fallback when nothing else matches."""
    current = {}
    old = {}
    for entry in rm_entries:
        emoji_name = entry.get("Emoji", "")
        if not emoji_name:
            continue
        filename = Path(entry["Src"]).name

        is_old = emoji_name.upper().startswith("OLD")
        target = old if is_old else current
        display_name = re.sub(r"^OLD\s*", "", emoji_name, flags=re.IGNORECASE)

        for key in {normalize(display_name), normalize(strip_parens(display_name))}:
            if key:
                target.setdefault(key, filename)
    return current, old


def find_match(ability_name, current, old):
    candidates = [ability_name, ALIASES.get(ability_name, ability_name)]

    barrage_match = re.match(r"^(\w+) Barrage$", ability_name)
    if barrage_match:
        candidates.append(f"Barrage ({barrage_match.group(1)})")

    candidates.append(f"{ability_name} ability")

    for lookup in (current, old):
        for candidate in candidates:
            for key in (normalize(candidate), normalize(strip_parens(candidate))):
                if key in lookup:
                    return lookup[key]
    return None


def main():
    if len(sys.argv) != 2:
        print("Usage: build-icon-map.py <path-to-RotationMaster-abilities.json>")
        sys.exit(1)

    rm_abilities_path = Path(sys.argv[1])
    ability_info = json.loads((ROOT / "data" / "abilityinfo.json").read_text())
    rm_entries = json.loads(rm_abilities_path.read_text())

    current_lookup, old_lookup = build_lookup(rm_entries)

    icon_map = {}
    unmatched = []
    for ability in ability_info:
        name = ability["action"]
        match = find_match(name, current_lookup, old_lookup)
        if match:
            icon_map[name] = match
        else:
            unmatched.append(name)

    out_path = ROOT / "data" / "icon-map.json"
    out_path.write_text(json.dumps(icon_map, indent=2, sort_keys=True))

    print(f"Matched {len(icon_map)}/{len(ability_info)} abilities.")
    print(f"Wrote {out_path}")
    if unmatched:
        print(f"\n{len(unmatched)} abilities with no icon match (will fall back to text in the overlay):")
        for name in unmatched:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
