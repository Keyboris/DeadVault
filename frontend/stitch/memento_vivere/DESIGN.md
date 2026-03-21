# Design System Documentation: The Existential Ledger

## 1. Overview & Creative North Star
This design system is built upon the "Creative North Star" of **The Existential Ledger**. It is a visual philosophy that treats wealth not as a collection of assets, but as a legacy frozen in time. The aesthetic moves away from the chaotic "fintech" trends of the last decade, opting instead for a high-end editorial experience that feels calm, controlled, and purposeful.

To break the "template" look, we utilize **Intentional Asymmetry**. Elements are not always perfectly centered; instead, they are weighted to create a rhythmic flow across the screen, mimicking the layout of a premium architectural journal. Oversized typography and significant white space (Negative Space) are used to emphasize the weight of the decisions being made within the application.

---

## 2. Colors
Our palette is anchored in absolute contrast. It uses a monochromatic foundation to convey permanence, punctuated by a singular "Vault Blue" to signify the security of the smart contract.

- **Primary Canvas:** `surface` (#f9f9f9) and `on-surface` (#1b1b1b).
- **The Vault:** Use `secondary_container` (#0448ff) as the primary background for the vault interaction area, with `on_secondary` (#ffffff) for all contained text and icons.
- **The "No-Line" Rule:** We do not use 1px solid borders to define sections. Layout boundaries must be established through background color shifts. For example, a card using `surface_container_lowest` should sit on a `surface_container_low` background. 
- **Surface Hierarchy:** 
    - Base layer: `surface`
    - Secondary sections: `surface_container_low`
    - Floating Cards: `surface_container_lowest`
- **Tonal Transitions:** While the user request specifies "no gradients" for aesthetic styles, we use **Tonal Layering**. If a CTA requires emphasis, use the `primary` (#484848) token rather than a decorative gradient.

---

## 3. Typography
The typography is the voice of the system: authoritative, sparse, and existential.

- **Display (Space Grotesk):** Use `display-lg` for terminal-state messaging (e.g., "MONEY HAS NO VALUE IN DEATH"). Letter-spacing should be set to -0.02em to create a dense, architectural block of text.
- **Headlines (Space Grotesk):** `headline-lg` should be used for section titles like "CONTRACT" or "VAULT STATUS."
- **Body (Manrope):** All functional text and smart contract details use `body-md`. Manrope provides a geometric clarity that feels modern yet approachable.
- **The Countdown:** The focal countdown timer should use a custom oversized weight (extrapolated from `display-lg`) but with a `thin` or `light` font-weight to maintain a "calm" rather than "alarming" presence.

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** and physical stacking metaphors rather than traditional skeuomorphism.

- **The Layering Principle:** Stack `surface-container` tiers to create a soft, natural lift. A card (Lowest) on a background (Low) creates a perceived 2mm lift without a single pixel of shadow.
- **Ambient Shadows:** For floating elements (like the Bottom Navigation), use a "Ghost Shadow":
    - Blur: 40px - 60px
    - Opacity: 4% - 6%
    - Color: `on-surface`
- **Glassmorphism:** For the Floating Bottom Navigation and Tooltips, use `surface_container_lowest` at 80% opacity with a `backdrop-blur` of 20px. This allows the existential headers to "bleed" through the UI, making the interface feel integrated into the content.
- **Roundedness:**
    - Cards: Use `xl` (3rem) for a friendly, high-end "pill" aesthetic.
    - Buttons/Inputs: Use `full` (9999px).

---

## 5. Components

### The Countdown Timer
A large-scale focal point using `display-lg` tokens. It should feel like a piece of gallery art. 
- **Styling:** No container. Just raw typography sitting on `surface`. 

### Vault Interaction Cards
- **Background:** `secondary_container` (#0448ff).
- **Radius:** `xl`.
- **Content:** White text (`on_secondary`). No dividers. Use Spacing Scale `8` (2.75rem) to separate internal groups.

### Floating Bottom Navigation
- **Style:** A floating pill-shaped container using `surface_container_highest` with 20% opacity and high blur.
- **Icons:** Use **React Icons (Line-based)** exclusively. Stroke width should be consistent (1.5px to 2px).
- **Radius:** `full`.

### Buttons
- **Primary:** `primary` background with `on_primary` text. Shape: `full`.
- **Secondary:** `surface_container_highest` background with `on_surface` text.
- **Interaction:** On hover, shift background to `primary_container`. No borders.

### Input Fields
- **Style:** Pill-shaped (`full`).
- **Background:** `surface_variant` (#e2e2e2).
- **Text:** `on_surface`.
- **Forbid:** Do not use 1px focus outlines. Use a subtle shift to `primary_fixed_dim` for the background on focus.

---

## 6. Do's and Don'ts

### Do
- **DO** use excessive white space. If a section feels "empty," it is likely correct.
- **DO** use the `20` (7rem) and `24` (8.5rem) spacing tokens for top-level padding to create an editorial feel.
- **DO** align text to a strict vertical axis even when using asymmetrical layouts.
- **DO** keep icons line-based and minimalist.

### Don't
- **DON'T** use 1px lines or dividers. Separate content with space or tone.
- **DON'T** use purple or any accent colors outside of Vault Blue (#0047FF).
- **DON'T** use standard "drop shadows." If it looks like a default CSS shadow, it is too heavy.
- **DON'T** crowd the countdown timer. It needs 360-degrees of breathing room.