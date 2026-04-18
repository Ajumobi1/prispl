
Make the Ondo State and ODCHC logos larger and more prominent in the headers across Dashboard, Task Tracker, and Account Admin pages.

## Changes

**Logo sizing (mobile-first):**
- Mobile: `h-12 w-12` (currently `h-8 w-8`)
- Desktop: `h-16 w-auto` for ODCHC (currently `h-12`), `h-14 w-14` for Ondo State

**Container styling:**
- Increase padding around logos: `p-1.5 sm:p-2` (currently `p-1`)
- Keep white rounded background with shadow for contrast against the gradient header
- Allow ODCHC logo to use natural aspect ratio (`w-auto`) instead of forced square

**Header layout adjustments:**
- Slightly increase header vertical padding to accommodate larger logos: `py-3 sm:py-4`
- Reduce title font size slightly on mobile so logos remain the focal point, or keep title visible by allowing it to wrap/truncate
- Ensure `min-w-0` and `truncate` still work so titles don't push logos off-screen on 375px screens

## Files to update

- `src/pages/Dashboard.tsx` — header logo block
- `src/pages/TaskTracker.tsx` — header logo block  
- `src/pages/AccountAdmin.tsx` — header logo block (apply same treatment for consistency)

## Verification

After approval, I'll check the result at 375px and 626px (current viewport) to confirm logos look prominent without breaking the title/nav layout.
