# n8n `/webhook/retouch` — "worn necklace + coloured backdrop" patch

The Studio Web frontend (`src/lib/retouch.js`) now sends four **new optional**
fields on the existing retouch webhook. The workflow currently ignores them, so
picking "Show worn, on a coloured backdrop" silently produces a normal flat shot.
This document is the drop-in logic to make the workflow honour them.

## New payload fields

Added to the existing body (`owner_id`, `image_url`, `mode`, `style`,
`style_custom?`, `target_metal?`, `target_metal_custom?`, `model_reference_url?`):

| Field                    | Type    | When sent                                        |
| ------------------------ | ------- | ------------------------------------------------ |
| `piece_type`             | string  | Only when not `'flat'` → `'necklace'` \| `'necklace_set'` |
| `worn`                   | `true`  | Only when the worn toggle is on                   |
| `backdrop_color`         | string  | Only when `worn` — see colour table below         |
| `backdrop_color_custom`  | string  | Only when `worn` and `backdrop_color === 'custom'` |

Important: when `worn` is true the frontend **hides** the normal background
picker, but `style` is still sent (it holds whatever was last selected). When
`worn` is true the workflow must **ignore `style`/`style_custom`** and use the
backdrop fields instead.

## Backdrop colour → prompt phrase

| `backdrop_color` | Phrase to use in the prompt                                  |
| ---------------- | ------------------------------------------------------------ |
| `emerald`        | deep emerald-green draped satin                                |
| `royal_blue`     | rich royal-blue draped satin                                   |
| `maroon`         | deep maroon draped velvet                                      |
| `wine`           | dark wine-red draped satin                                     |
| `black`          | glossy black draped satin                                      |
| `ivory`          | soft ivory draped silk                                         |
| `blush`          | soft blush-pink draped satin                                   |
| `custom`         | use `backdrop_color_custom` verbatim                           |

## Drop-in Code node

Place this **before** the node that calls Gemini, and feed its `prompt` output
into that node. It returns the existing behaviour untouched when `worn` is falsy.

```js
// n8n Code node (Run Once for All Items) — build the retouch/variant prompt.
const BACKDROPS = {
  emerald:    'deep emerald-green draped satin',
  royal_blue: 'rich royal-blue draped satin',
  maroon:     'deep maroon draped velvet',
  wine:       'dark wine-red draped satin',
  black:      'glossy black draped satin',
  ivory:      'soft ivory draped silk',
  blush:      'soft blush-pink draped satin',
};

const PIECE_WORN = {
  necklace:
    'worn around the neck of an elegant faceless mannequin bust, the necklace ' +
    'lying naturally along the collarbone with correct drape and gravity',
  necklace_set:
    'worn as a complete set on an elegant faceless mannequin bust — the necklace ' +
    'around the neck lying naturally along the collarbone, with the matching ' +
    'earrings displayed beside the bust at ear height, all pieces at consistent scale',
};

return items.map((item) => {
  const b = item.json.body || item.json;

  const worn = b.worn === true || b.worn === 'true';
  const pieceType = b.piece_type || 'flat';

  let prompt;

  if (worn && PIECE_WORN[pieceType]) {
    const backdrop = b.backdrop_color === 'custom'
      ? (b.backdrop_color_custom || '').trim() || BACKDROPS.emerald
      : BACKDROPS[b.backdrop_color] || BACKDROPS.emerald;

    prompt =
      `Photograph this exact jewellery piece ${PIECE_WORN[pieceType]}. ` +
      `Background: ${backdrop}, softly lit with a gentle falloff so the fabric ` +
      `folds read but stay subdued behind the piece. ` +
      `Studio product photography, soft key light with a subtle highlight on the ` +
      `metal and sparkle in the stones, shallow depth of field on the backdrop only. ` +
      `CRITICAL: reproduce the design, stones, enamel, metal colour and proportions ` +
      `of the source piece EXACTLY — do not redesign, add, or remove any element. ` +
      `Show no human face, no skin texture, no model's body beyond a plain ` +
      `neutral mannequin form.`;

    // Metal Swap: still apply the metal change on top of the worn treatment.
    if (b.mode === 'variant' && b.target_metal) {
      const metal = b.target_metal === 'custom'
        ? (b.target_metal_custom || '').trim()
        : String(b.target_metal).replace(/_/g, ' ');
      if (metal) {
        prompt += ` Render the metal as ${metal}, keeping the design, stones and ` +
                  `setting identical to the source.`;
      }
    }
  } else {
    // ---- existing behaviour: leave your current prompt logic here ----
    prompt = item.json.prompt; // replace with the workflow's current builder
  }

  return { json: { ...b, prompt } };
});
```

## Notes / decisions baked in

- **Faceless mannequin, not a human model.** Keeps output consistent, avoids the
  face-consistency problem that `model_reference_url` exists to work around, and
  sidesteps generating identifiable people. If you'd rather use a human model,
  swap the `PIECE_WORN` phrasings and drop the "no human face" clause — but then
  feed `model_reference_url` in as an input image for consistency across a batch.
- **`necklace_set` places earrings beside the bust** rather than on ears, since
  the mannequin has no ears. Adjust if your mannequin reference does.
- **`style` is deliberately ignored when `worn` is true** — the frontend hides
  that picker in worn mode, so its value is stale.
- The `worn` check accepts the string `'true'` as well, in case a proxy or form
  encoding stringifies the boolean.
